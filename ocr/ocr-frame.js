'use strict';

// This script runs inside an extension iframe (chrome-extension:// origin).
// It has full access to extension APIs and can load Tesseract.js workers from
// extension URLs without CORS restrictions.

let worker = null;
let workerLang = null;

async function getWorker(lang) {
  if (worker && workerLang === lang) return worker;

  // Terminate previous worker if language changed
  if (worker) {
    await worker.terminate();
    worker = null;
  }

  const workerPath = chrome.runtime.getURL('lib/worker.min.js');
  const corePath = chrome.runtime.getURL('lib/');

  worker = await Tesseract.createWorker(lang, 1, {
    workerPath,
    corePath,
    // Language data downloaded from official CDN and cached by Tesseract.js in IndexedDB
    langPath: 'https://tessdata.projectnaptha.com/4.0.0/',
    cacheMethod: 'write',
    logger: () => {}
  });

  workerLang = lang;
  return worker;
}

// Signal to parent that the frame is ready
window.parent.postMessage({ type: 'MT_OCR_READY' }, '*');

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'MT_OCR_REQUEST') return;

  const { id, imageData, lang } = e.data;

  try {
    const w = await getWorker(lang || 'eng');
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
      bbox: {
        x0: para.bbox.x0,
        y0: para.bbox.y0,
        x1: para.bbox.x1,
        y1: para.bbox.y1
      },
      confidence: Math.round(para.confidence)
    });
  }

  return blocks;
}
