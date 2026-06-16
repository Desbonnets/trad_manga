'use strict';

document.getElementById('btn-translate-page').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'translatePage' });
  window.close();
});

document.getElementById('btn-toggle').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggleTranslations' });
  window.close();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'clearTranslations' }).catch(() => {});
  });
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
