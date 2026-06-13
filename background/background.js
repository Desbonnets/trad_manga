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
    displayMode: 'floating'
  };
}

// ─── Context menu ──────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-image') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateImage',
      srcUrl: info.srcUrl
    });
  }
});

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener((command, tab) => {
  chrome.tabs.sendMessage(tab.id, { action: command });
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

    // Content script: screenshot + crop (bypasses hotlink protection)
    case 'captureImageRegion':
      captureImageRegion(sender.tab, msg.rect, msg.dpr)
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
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, msg);
  });
}

// Capture a region of the currently visible tab as a PNG data URL.
// Uses captureVisibleTab so the image is read from the browser's rendered frame —
// no network request is made, which completely bypasses hotlink protection (403).
async function captureImageRegion(tab, rect, dpr) {
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

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    imageBitmap,
    px(rect.left), px(rect.top), cropW, cropH, // source region
    0, 0, cropW, cropH                          // destination
  );

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result });
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(croppedBlob);
  });
}
