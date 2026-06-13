'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────

const state = {
  overlays: [],
  visible: true,
  hoveredImage: null,
  ocrFrame: null,
  ocrReady: false,
  ocrCallbacks: new Map(),
  ocrRequestId: 0,
  settings: null
};

// ─── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('settings', data => {
      state.settings = data.settings || defaultSettings();
      resolve(state.settings);
    });
  });
}

function defaultSettings() {
  return {
    ocrLang: 'eng',
    sourceLang: 'en',
    targetLang: 'fr',
    translationApi: 'mymemory',
    translationEndpoint: '',
    fontSize: 14,
    opacity: 0.92,
    bgColor: '#0f0f1a',
    textColor: '#e8e8f0'
  };
}

// ─── OCR Frame ─────────────────────────────────────────────────────────────────

function initOCRFrame() {
  if (state.ocrFrame) return;

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('ocr/ocr-frame.html');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'display:none;position:fixed;width:0;height:0;border:none;z-index:-1;';
  (document.body || document.documentElement).appendChild(frame);
  state.ocrFrame = frame;
}

window.addEventListener('message', e => {
  const { type, id, blocks, error } = e.data || {};

  if (type === 'MT_OCR_READY') {
    state.ocrReady = true;
    return;
  }

  if (type === 'MT_OCR_RESULT') {
    const cb = state.ocrCallbacks.get(id);
    if (!cb) return;
    state.ocrCallbacks.delete(id);
    if (error) cb.reject(new Error(error));
    else cb.resolve(blocks);
  }
});

function waitForOCRReady(timeoutMs = 20000) {
  if (state.ocrReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (state.ocrReady) { resolve(); return; }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('OCR frame timeout'));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function runOCR(imageData, lang) {
  initOCRFrame();
  await waitForOCRReady();

  const id = ++state.ocrRequestId;
  return new Promise((resolve, reject) => {
    state.ocrCallbacks.set(id, { resolve, reject });
    state.ocrFrame.contentWindow.postMessage(
      { type: 'MT_OCR_REQUEST', id, imageData, lang },
      '*'
    );
  });
}

// ─── Image helpers ─────────────────────────────────────────────────────────────

async function getImageDataUrl(img) {
  // Try direct canvas (works for same-origin or CORS-enabled images)
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width === 0 || canvas.height === 0) throw new Error('zero-size image');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/png'); // throws if tainted
    return dataUrl;
  } catch {
    // Cross-origin: ask background to fetch it
    const result = await chrome.runtime.sendMessage({
      action: 'fetchImageAsDataUrl',
      url: img.src
    });
    if (result.error) throw new Error(result.error);
    return result.dataUrl;
  }
}

function findImageBySrc(srcUrl) {
  return Array.from(document.querySelectorAll('img')).find(
    img => img.src === srcUrl || img.currentSrc === srcUrl
  );
}

// ─── Translation ───────────────────────────────────────────────────────────────

async function translate(text, { sourceLang, targetLang, translationApi, translationEndpoint }) {
  if (!text.trim()) return text;
  try {
    if (translationApi === 'libretranslate' && translationEndpoint) {
      return await translateLibreTranslate(text, sourceLang, targetLang, translationEndpoint);
    }
    return await translateMyMemory(text, sourceLang, targetLang);
  } catch {
    return text; // return original on error
  }
}

async function translateMyMemory(text, src, tgt) {
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(data.responseMessage || 'MyMemory error');
}

async function translateLibreTranslate(text, src, tgt, endpoint) {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' })
  });
  const data = await res.json();
  return data.translatedText;
}

// ─── Overlay ───────────────────────────────────────────────────────────────────

function createOverlay(block, translatedText, imageRect, imageEl) {
  const s = state.settings;
  const scaleX = imageEl.offsetWidth / (imageEl.naturalWidth || imageEl.offsetWidth || 1);
  const scaleY = imageEl.offsetHeight / (imageEl.naturalHeight || imageEl.offsetHeight || 1);

  const x = imageRect.left + window.scrollX + block.bbox.x0 * scaleX;
  const y = imageRect.top + window.scrollY + block.bbox.y0 * scaleY;

  const el = document.createElement('div');
  el.className = 'mt-overlay';
  el.style.cssText = `left:${x}px;top:${y}px;font-size:${s.fontSize}px;` +
    `background:${hexToRgba(s.bgColor, s.opacity)};color:${s.textColor};`;

  // Header (drag handle + controls)
  const header = document.createElement('div');
  header.className = 'mt-overlay-header';

  const btnMinimize = makeBtn('−', 'mt-btn', 'Réduire', () => {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    btnMinimize.textContent = isHidden ? '−' : '+';
  });

  const btnClose = makeBtn('×', 'mt-btn', 'Fermer', () => {
    el.remove();
    state.overlays = state.overlays.filter(o => o !== el);
  });

  header.append(btnMinimize, btnClose);

  // Body
  const body = document.createElement('div');
  body.className = 'mt-overlay-body';

  const origEl = document.createElement('p');
  origEl.className = 'mt-original';
  origEl.textContent = block.text;

  const transEl = document.createElement('p');
  transEl.className = 'mt-translated';
  transEl.textContent = translatedText;

  body.append(origEl, transEl);
  el.append(header, body);

  makeDraggable(el, header);
  document.body.appendChild(el);
  state.overlays.push(el);
  return el;
}

function makeBtn(label, cls, title, onClick) {
  const btn = document.createElement('button');
  btn.className = cls;
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

function makeDraggable(el, handle) {
  let ox, oy, ol, ot;

  handle.addEventListener('mousedown', e => {
    if (e.target.classList.contains('mt-btn')) return;
    e.preventDefault();
    ox = e.clientX;
    oy = e.clientY;
    ol = parseInt(el.style.left) || 0;
    ot = parseInt(el.style.top) || 0;
    el.classList.add('mt-dragging');

    const move = e => {
      el.style.left = `${ol + e.clientX - ox}px`;
      el.style.top = `${ot + e.clientY - oy}px`;
    };
    const up = () => {
      el.classList.remove('mt-dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Notifications ─────────────────────────────────────────────────────────────

function notify(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `mt-notif mt-notif--${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2700);
}

// ─── Main actions ──────────────────────────────────────────────────────────────

async function translateImage(imageEl) {
  if (!imageEl) {
    notify('Aucune image sélectionnée', 'error');
    return;
  }

  await loadSettings();
  notify('Analyse OCR en cours…', 'info');

  let dataUrl;
  try {
    dataUrl = await getImageDataUrl(imageEl);
  } catch (err) {
    notify(`Impossible de lire l'image : ${err.message}`, 'error');
    return;
  }

  let blocks;
  try {
    blocks = await runOCR(dataUrl, state.settings.ocrLang);
  } catch (err) {
    notify(`Erreur OCR : ${err.message}`, 'error');
    return;
  }

  if (!blocks || blocks.length === 0) {
    notify('Aucun texte détecté dans l'image', 'warning');
    return;
  }

  notify(`${blocks.length} bloc(s) détecté(s) — traduction…`, 'info');

  const rect = imageEl.getBoundingClientRect();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const translated = await translate(block.text, state.settings);
    createOverlay(block, translated, rect, imageEl);
  }

  notify(`Traduction terminée (${blocks.length} bloc(s))`, 'success');
}

async function translatePage() {
  await loadSettings();
  const images = Array.from(document.querySelectorAll('img')).filter(
    img => img.offsetWidth >= 100 && img.offsetHeight >= 100 && !img.closest('.mt-overlay')
  );

  if (images.length === 0) {
    notify('Aucune image de taille suffisante trouvée', 'warning');
    return;
  }

  notify(`Traduction de ${images.length} image(s)…`, 'info');
  for (const img of images) await translateImage(img);
}

function toggleTranslations() {
  state.visible = !state.visible;
  state.overlays.forEach(el => { el.style.display = state.visible ? '' : 'none'; });
  notify(state.visible ? 'Traductions affichées' : 'Traductions masquées', 'info');
}

function clearTranslations() {
  state.overlays.forEach(el => el.remove());
  state.overlays = [];
  notify('Traductions effacées', 'info');
}

// ─── Track hovered image ───────────────────────────────────────────────────────

document.addEventListener('mouseover', e => {
  if (e.target.tagName === 'IMG') state.hoveredImage = e.target;
}, true);

// ─── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.action) {
    case 'translateImage':
      translateImage(findImageBySrc(msg.srcUrl) || state.hoveredImage);
      break;
    case 'translatePage':
      translatePage();
      break;
    case 'toggleTranslations':
    case 'toggle-translations':
      toggleTranslations();
      break;
    case 'clearTranslations':
      clearTranslations();
      break;
    case 'translate-image':
      translateImage(state.hoveredImage);
      break;
    case 'refresh-translations':
      clearTranslations();
      translatePage();
      break;
  }
});
