'use strict';

// ─── Installation ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-image',
    title: 'Traduire cette image',
    contexts: ['image']
  });
  initDefaultSettings();
});

async function initDefaultSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({ settings: defaultSettings() });
  }
}

function defaultSettings() {
  return {
    ocrLang: 'eng',
    sourceLang: 'en',
    targetLang: 'fr',
    translationApi: 'lingva',
    translationEndpoint: '',
    deepLKey: '',
    fontSize: 14,
    opacity: 0.92,
    bgColor: '#0f0f1a',
    textColor: '#e8e8f0',
    displayMode: 'floating',
    deepScan: false
  };
}

// ─── Context menu ──────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-image') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateImage',
      srcUrl: info.srcUrl
    }).catch(() => {});
  }
});

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command, tab) => {
  chrome.tabs.sendMessage(tab.id, { action: command }).catch(() => {});
});

// ─── Messages ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    // Popup → active tab
    case 'translatePage':
    case 'toggleTranslations':
    case 'clearTranslations':
      forwardToActiveTab(msg);
      break;

    // Content script: fetch full image via service worker (no CORS restriction)
    case 'fetchImageAsDataUrl':
      fetchImageAsDataUrl(msg.url, msg.referrer)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // async

    // Content script: screenshot + crop (bypasses hotlink protection)
    case 'captureImageRegion':
      captureImageRegion(sender.tab, msg.rect, msg.dpr, msg.upscale)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // async

    // Settings CRUD
    case 'getSettings':
      chrome.storage.local.get('settings', data =>
        sendResponse(data.settings || defaultSettings())
      );
      return true;

    case 'saveSettings':
      chrome.storage.local.set({ settings: msg.settings }, () =>
        sendResponse({ ok: true })
      );
      return true;
  }
});

function forwardToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
  });
}

// Fetch a remote image as a base64 data URL.
// The service worker has <all_urls> permission — no CORS restriction,
// so it can download any image at its original full resolution.
async function fetchImageAsDataUrl(url, referrer) {
  const res = await fetch(url, {
    credentials: 'omit',
    referrer: referrer || '',
    referrerPolicy: 'strict-origin-when-cross-origin'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url.slice(0, 80)}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result });
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

// Capture a region of the currently visible tab as a PNG data URL.
// Uses captureVisibleTab so the image is read from the browser's rendered frame —
// no network request is made, which completely bypasses hotlink protection (403).
async function captureImageRegion(tab, rect, dpr, upscale) {
  upscale = upscale ?? 2; // default 2× for single captures; pass 1 for scroll-and-stitch
  const windowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;

  const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png'
  });

  // Decode screenshot into an ImageBitmap, then crop with OffscreenCanvas
  const response = await fetch(screenshotDataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  // rect is in CSS pixels; the screenshot is in physical pixels (CSS px * dpr)
  const px = v => Math.round(v * dpr);

  const cropW = Math.max(1, px(rect.width));
  const cropH = Math.max(1, px(rect.height));

  // Crop at native resolution first
  const cropCanvas = new OffscreenCanvas(cropW, cropH);
  cropCanvas.getContext('2d').drawImage(
    imageBitmap,
    px(rect.left), px(rect.top), cropW, cropH,
    0, 0, cropW, cropH
  );

  if (upscale <= 1) {
    const croppedBlob = await cropCanvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result });
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(croppedBlob);
    });
  }

  // Upscale — screenshot resolution is often too low for Tesseract to detect
  // small manga speech-bubble text reliably.
  const canvas = new OffscreenCanvas(cropW * upscale, cropH * upscale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cropCanvas, 0, 0, cropW * upscale, cropH * upscale);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result });
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(croppedBlob);
  });
}
