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
  }

  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js non chargé — vérifiez lib/tesseract.min.js (node scripts/setup.js)');
  }

  const workerPath = chrome.runtime.getURL('lib/worker.min.js');

  worker = await Tesseract.createWorker(lang, 1, {
    workerPath,
    // corePath omitted → Tesseract.js uses its built-in CDN URL for the WASM core
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
  await worker.setParameters({ tessedit_pageseg_mode: '11' });

  workerLang = lang;
  return worker;
}

// Signal parent that the frame is ready
window.parent.postMessage({ type: 'MT_OCR_READY' }, '*');

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'MT_OCR_REQUEST') return;

  const { id, imageData, lang } = e.data;
  currentRequestId = id;

  try {
    const processed = await preprocessImage(imageData);
    const w = await getWorker(lang || 'eng', id);
    const { data } = await w.recognize(processed);
    const blocks = extractBlocks(data);
    e.source.postMessage({ type: 'MT_OCR_RESULT', id, blocks }, '*');
  } catch (err) {
    e.source.postMessage({ type: 'MT_OCR_RESULT', id, error: err.message }, '*');
  }
});

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

function extractBlocks(data) {
  const blocks = [];

  // Try paragraphs first (best grouping for translation)
  for (const para of (data.paragraphs || [])) {
    const text = para.text.trim();
    if (!text) continue;
    // Lower threshold (10 instead of 25): manga fonts and compressed scans
    // score lower in Tesseract confidence even when readable.
    if (para.confidence < 10) continue;
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
      blocks.push({
        text,
        bbox: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
        confidence: Math.round(line.confidence)
      });
    }
  }

  return blocks;
}
