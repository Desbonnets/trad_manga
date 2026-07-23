'use strict';

// Runs inside an extension iframe (chrome-extension:// origin).
// Full access to extension APIs and Tesseract.js workers.

let worker = null;
let workerLang = null;
let currentRequestId = null;

async function getWorker(lang, requestId) {
  if (worker && workerLang === lang) return worker;

  if (worker) {
    await worker.terminate();
    worker = null;
    workerLang = null;
  }

  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js non chargé — vérifiez lib/tesseract.min.js (node scripts/setup.js)');
  }

  // Built in a local variable and only committed to the module-level `worker` /
  // `workerLang` once fully configured. If createWorker or setParameters throws
  // partway, module state stays null instead of pointing at a half-initialized
  // worker that a later call could mistake for ready (or leaking it unterminated).
  let newWorker;
  try {
    // workerBlobURL: false → Tesseract creates the Worker directly from the chrome-extension://
    // URL instead of wrapping it in an intermediate Blob that can't importScripts across origins.
    // This works because the OCR iframe is the same chrome-extension:// origin as the worker file.
    newWorker = await Tesseract.createWorker(lang, 1, {
      workerPath: chrome.runtime.getURL('lib/worker.min.js'),
      workerBlobURL: false,
      corePath: chrome.runtime.getURL('lib/'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0/',
      cacheMethod: 'write',
      logger: (m) => {
        if (m.status && m.progress !== undefined) {
          window.parent.postMessage({
            type: 'MT_OCR_PROGRESS',
            requestId,
            status: m.status,
            progress: m.progress
          }, '*');
        }
      }
    });

    // PSM 11 = Sparse text: find as much text as possible in no particular order.
    // Much better than the default (PSM 3) for manga where text is scattered
    // across isolated speech bubbles rather than laid out in continuous blocks.
    // user_defined_dpi: bypass Tesseract's auto-estimation (can guess 500+ DPI on
    // screenshots and crash the WASM core). 70 = standard web screen resolution.
    await newWorker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '70' });
  } catch (err) {
    if (newWorker) await newWorker.terminate().catch(() => {});
    throw err;
  }

  worker = newWorker;
  workerLang = lang;
  return worker;
}

// Signal parent that the frame is ready
window.parent.postMessage({ type: 'MT_OCR_READY' }, '*');

// Deep-scan mode re-runs OCR on the image rotated by these extra angles (in
// addition to 0°) and merges the results. Tesseract's layout analysis assumes
// roughly horizontal text lines, so a tilted sign or SFX is often missed
// entirely at 0° — rotating the whole image brings it back to horizontal for
// one of the passes. This triples/quadruples processing time, so it's opt-in
// (settings.deepScan) rather than the default.
const DEEP_SCAN_ANGLES = [0, 25, -25];

async function runSinglePass(w, imageData, angle) {
  const rotated = angle === 0 ? imageData : await rotateImageDataUrl(imageData, angle);
  const processed = await preprocessImage(rotated);
  const { data } = await w.recognize(processed);
  const rawBlocks = extractBlocks(data);
  const blocks = groupBlocksByProximity(rawBlocks);

  return {
    blocks,
    debug: {
      angle,
      rawText: data.text?.trim().substring(0, 200) || '(vide)',
      words: data.words?.length ?? 0,
      lines: data.lines?.length ?? 0,
      paragraphs: data.paragraphs?.length ?? 0,
      blocksAfterFilter: rawBlocks.length,
      blocksAfterGrouping: blocks.length,
      maxConfidence: data.words?.length
        ? Math.max(...data.words.map(word => word.confidence)).toFixed(1)
        : 'N/A'
    }
  };
}

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'MT_OCR_REQUEST') return;

  const { id, imageData, lang, deepScan } = e.data;
  currentRequestId = id;

  try {
    const angles = deepScan ? DEEP_SCAN_ANGLES : [0];
    const w = await getWorker(lang || 'eng', id);

    const passes = [];
    for (let i = 0; i < angles.length; i++) {
      if (angles.length > 1) {
        window.parent.postMessage({
          type: 'MT_OCR_PROGRESS',
          requestId: id,
          status: 'recognizing text',
          progress: i / angles.length,
          pass: { index: i + 1, total: angles.length, angle: angles[i] }
        }, '*');
      }
      passes.push(await runSinglePass(w, imageData, angles[i]));
    }

    const blocks = passes.length > 1
      ? mergeBlockPasses(passes.map(p => p.blocks))
      : passes[0].blocks;

    const debug = passes.length > 1
      ? { passes: passes.map(p => p.debug), blocksAfterMerge: blocks.length }
      : passes[0].debug;

    e.source.postMessage({ type: 'MT_OCR_RESULT', id, blocks, debug }, '*');
  } catch (err) {
    e.source.postMessage({ type: 'MT_OCR_RESULT', id, error: err.message }, '*');
  }
});

// Rotates the image by `degrees` around its center, expanding the canvas so
// corners aren't clipped, and fills the now-empty corners white (matches the
// page background manga scans almost always have, so it doesn't get read as
// dark noise by the black/white contrast step in preprocessImage).
function rotateImageDataUrl(dataUrl, degrees) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const w = img.width;
      const h = img.height;
      const newW = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
      const newH = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, newW, newH);
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -w / 2, -h / 2);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Rotation: image load failed'));
    img.src = dataUrl;
  });
}

// Convert image to high-contrast grayscale before OCR.
// Tesseract works best on clean black-on-white (or white-on-black) images.
async function preprocessImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;

      for (let i = 0; i < d.length; i += 4) {
        // Luminance-weighted grayscale
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Contrast boost (1.8×): push midtones toward black or white
        const v = Math.min(255, Math.max(0, (gray - 128) * 1.8 + 128));
        d[i] = d[i + 1] = d[i + 2] = v;
        // alpha unchanged
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Preprocessing: image load failed'));
    img.src = dataUrl;
  });
}

// Screentones, speed lines and art details often get misread by Tesseract as
// short garbage tokens ("oN", "00", "K", "—") — these clear the low overall
// confidence threshold below but carry almost no real letters/digits, so they
// need a stricter confidence bar than genuine (if noisy) manga text.
function isLikelyNoise(text, confidence) {
  const clean = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (clean.length === 0) return true; // pure punctuation/symbols
  // A single character is never useful to translate on its own (real manga
  // dialogue is essentially never one letter/digit) and is almost always a
  // misread art artifact — filter it regardless of Tesseract's confidence.
  if (clean.length === 1) return true;
  if (clean.length <= 3 && confidence < 60) return true; // short fragment, not confident enough
  return false;
}

function extractBlocks(data) {
  const blocks = [];

  // Try paragraphs first (best grouping for translation)
  for (const para of (data.paragraphs || [])) {
    const text = para.text.trim();
    if (!text) continue;
    // Lower threshold (10 instead of 25): manga fonts and compressed scans
    // score lower in Tesseract confidence even when readable.
    if (para.confidence < 10) continue;
    if (isLikelyNoise(text, para.confidence)) continue;
    blocks.push({
      text,
      bbox: { x0: para.bbox.x0, y0: para.bbox.y0, x1: para.bbox.x1, y1: para.bbox.y1 },
      confidence: Math.round(para.confidence)
    });
  }

  // Fallback: if paragraphs empty, try lines (captures isolated bubble text better)
  if (blocks.length === 0) {
    for (const line of (data.lines || [])) {
      const text = line.text.trim();
      if (!text || line.confidence < 10) continue;
      if (isLikelyNoise(text, line.confidence)) continue;
      blocks.push({
        text,
        bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
        confidence: Math.round(line.confidence)
      });
    }
  }

  return blocks;
}

function unionBbox(a, b) {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1)
  };
}

// Two blocks belong to the same wrapped sentence when they're stacked closely
// vertically (gap smaller than roughly one line height — not the accumulated
// height of an already-merged group, so the threshold doesn't loosen as more
// lines join) and share horizontal space (same speech-bubble column). Blocks
// further apart, or in a different column (e.g. a sign elsewhere in the
// panel), are kept separate.
function shouldMergeLine(prevBbox, nextBbox) {
  const prevHeight = prevBbox.y1 - prevBbox.y0;
  const gapY = nextBbox.y0 - prevBbox.y1;
  const verticallyClose = gapY > -prevHeight && gapY < Math.max(prevHeight, 10) * 0.8;
  const horizontallyOverlaps = nextBbox.x0 < prevBbox.x1 && nextBbox.x1 > prevBbox.x0;
  return verticallyClose && horizontallyOverlaps;
}

// Tesseract (PSM 11 sparse-text) frequently splits a single wrapped speech
// bubble into one "paragraph" per line instead of one per bubble — translating
// each line in isolation loses sentence context (e.g. "DOCTOR! THE" translated
// alone reads as nonsense instead of "Doctor! The patient is having trouble
// breathing!" as a whole). Adjacent, vertically-stacked, horizontally
// overlapping blocks are merged into a single unit before translation.
function groupBlocksByProximity(blocks) {
  if (blocks.length <= 1) return blocks;

  const sorted = [...blocks].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const groups = [];
  for (const block of sorted) {
    const last = groups[groups.length - 1];
    if (last && shouldMergeLine(last.lastBbox, block.bbox)) {
      last.texts.push(block.text);
      last.bbox = unionBbox(last.bbox, block.bbox);
      last.confidences.push(block.confidence);
      last.lastBbox = block.bbox;
    } else {
      groups.push({
        texts: [block.text],
        bbox: { ...block.bbox },
        lastBbox: block.bbox,
        confidences: [block.confidence]
      });
    }
  }

  return groups.map(g => ({
    text: g.texts.join(' '),
    bbox: g.bbox,
    confidence: Math.round(g.confidences.reduce((sum, c) => sum + c, 0) / g.confidences.length)
  }));
}

function normalizeForCompare(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Cheap token-overlap ratio — good enough to catch "near duplicate" reads of
// the same bubble across rotation passes without pulling in a diff library.
function textSimilarity(a, b) {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const setA = new Set(na.split(' '));
  const setB = new Set(nb.split(' '));
  const shared = [...setA].filter(t => setB.has(t)).length;
  return shared / Math.max(setA.size, setB.size);
}

// Deep-scan mode runs OCR at several rotation angles — the same real text is
// often rediscovered (and read slightly differently) at more than one angle,
// so near-duplicates are collapsed, keeping the highest-confidence reading.
// Text found in only one pass (e.g. a tilted sign only readable once rotated
// to horizontal) is kept as its own block.
function mergeBlockPasses(passBlockLists) {
  const merged = [];
  for (const blocks of passBlockLists) {
    for (const block of blocks) {
      const dupIndex = merged.findIndex(m => textSimilarity(m.text, block.text) >= 0.7);
      if (dupIndex === -1) {
        merged.push(block);
      } else if (block.confidence > merged[dupIndex].confidence) {
        merged[dupIndex] = block;
      }
    }
  }
  return merged;
}

// Node-only export for unit tests (node:test) — no-op in the browser/iframe context.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isLikelyNoise,
    extractBlocks,
    groupBlocksByProximity,
    mergeBlockPasses,
    normalizeForCompare
  };
}
