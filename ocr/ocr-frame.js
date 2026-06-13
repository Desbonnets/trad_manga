'use strict';

// Runs inside an extension iframe (chrome-extension:// origin).
// Full access to extension APIs + Tesseract.js workers.

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
    throw new Error('Tesseract.js non chargé — vérifiez que lib/tesseract.min.js existe (node scripts/setup.js)');
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
    const w = await getWorker(lang || 'eng', id);
    const { data } = await w.recognize(imageData);
    const blocks = extractBlocks(data);
    e.source.postMessage({ type: 'MT_OCR_RESULT', id, blocks }, '*');
  } catch (err) {
    e.source.postMessage({ type: 'MT_OCR_RESULT', id, error: err.message }, '*');
  }
});

function extractBlocks(data) {
  const blocks = [];
  for (const para of data.paragraphs) {
    const text = para.text.trim();
    if (!text || para.confidence < 25) continue;
    blocks.push({
      text,
      bbox: { x0: para.bbox.x0, y0: para.bbox.y0, x1: para.bbox.x1, y1: para.bbox.y1 },
      confidence: Math.round(para.confidence)
    });
  }
  return blocks;
}
