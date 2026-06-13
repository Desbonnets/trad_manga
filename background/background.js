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
    // Popup → all tabs
    case 'translatePage':
    case 'toggleTranslations':
    case 'clearTranslations':
      forwardToActiveTab(msg);
      break;

    // Content script asks to fetch a cross-origin image
    case 'fetchImageAsDataUrl':
      fetchImageAsDataUrl(msg.url).then(sendResponse).catch(err =>
        sendResponse({ error: err.message })
      );
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

async function fetchImageAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result });
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}
