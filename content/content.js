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
    translationApi: 'lingva',
    translationEndpoint: '',
    deepLKey: '',
    fontSize: 14,
    opacity: 0.92,
    bgColor: '#0f0f1a',
    textColor: '#e8e8f0'
  };
}

// ─── Loader ────────────────────────────────────────────────────────────────────

let activeLoader = null;

function createLoader() {
  if (activeLoader) activeLoader.remove();

  const el = document.createElement('div');
  el.id = 'mt-loader';
  // Use inline styles + !important to resist page CSS overrides
  el.style.cssText = [
    'position:fixed!important',
    'bottom:24px!important',
    'right:24px!important',
    'z-index:2147483647!important',
    'min-width:230px',
    'max-width:320px',
    'background:rgba(15,15,26,0.97)',
    'color:#e8e8f0',
    'font-family:system-ui,sans-serif',
    'font-size:13px',
    'border-radius:10px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.08)',
    'padding:14px 16px',
    'pointer-events:none',
    'display:flex!important',
    'flex-direction:column',
    'gap:8px'
  ].join(';');

  // Spinner + label row
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px';

  const spinner = document.createElement('div');
  spinner.style.cssText = [
    'width:18px',
    'height:18px',
    'border:2px solid rgba(233,69,96,0.25)',
    'border-top-color:#e94560',
    'border-radius:50%',
    'flex-shrink:0',
    'animation:mt-spin 0.75s linear infinite'
  ].join(';');

  // Inject keyframes once
  if (!document.getElementById('mt-keyframes')) {
    const style = document.createElement('style');
    style.id = 'mt-keyframes';
    style.textContent = '@keyframes mt-spin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(style);
  }

  const label = document.createElement('span');
  label.textContent = 'Initialisation…';
  label.style.cssText = 'font-weight:500;flex:1';

  row.append(spinner, label);

  // Progress bar
  const barWrap = document.createElement('div');
  barWrap.style.cssText = 'height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden';

  const barFill = document.createElement('div');
  barFill.style.cssText = 'height:100%;width:0%;background:#e94560;border-radius:2px;transition:width 0.2s ease';
  barWrap.appendChild(barFill);

  // Sub-label
  const sub = document.createElement('span');
  sub.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.4);line-height:1.3';

  el.append(row, barWrap, sub);
  (document.body || document.documentElement).appendChild(el);

  activeLoader = {
    el,
    update(text, progress, subText) {
      label.textContent = text;
      if (progress !== undefined) barFill.style.width = `${Math.round(progress * 100)}%`;
      if (subText !== undefined) sub.textContent = subText;
    },
    remove() {
      el.remove();
      activeLoader = null;
    }
  };

  return activeLoader;
}

// ─── Notifications (inline styles to resist page CSS) ──────────────────────────

function notify(message, type = 'info') {
  const palette = {
    info:    { bg: '#1a73e8', color: '#fff' },
    success: { bg: '#137333', color: '#fff' },
    warning: { bg: '#f9ab00', color: '#1a1a1a' },
    error:   { bg: '#c5221f', color: '#fff' }
  };
  const c = palette[type] || palette.info;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed!important',
    'bottom:24px!important',
    'right:24px!important',
    'z-index:2147483647!important',
    'padding:10px 10px 10px 14px',
    'border-radius:8px',
    `background:${c.bg}`,
    `color:${c.color}`,
    'font-family:system-ui,sans-serif',
    'font-size:13px',
    'font-weight:500',
    'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
    'max-width:340px',
    'word-break:break-word',
    'pointer-events:auto',
    'opacity:1',
    'transition:opacity 0.3s',
    'display:flex!important',
    'align-items:flex-start',
    'gap:10px'
  ].join(';');

  const text = document.createElement('span');
  text.style.cssText = 'flex:1';
  text.textContent = message;

  const btnClose = document.createElement('button');
  btnClose.textContent = '×';
  btnClose.style.cssText = [
    'flex-shrink:0',
    'background:none',
    'border:none',
    'cursor:pointer',
    'font-size:16px',
    'line-height:1',
    'padding:0 2px',
    'opacity:0.65',
    `color:${c.color}`
  ].join(';');
  btnClose.addEventListener('mouseover', () => { btnClose.style.opacity = '1'; });
  btnClose.addEventListener('mouseout',  () => { btnClose.style.opacity = '0.65'; });
  btnClose.addEventListener('click', dismiss);

  el.append(text, btnClose);
  (document.body || document.documentElement).appendChild(el);

  const timer = setTimeout(dismiss, 10000);

  function dismiss() {
    clearTimeout(timer);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }
}

// ─── OCR Frame ─────────────────────────────────────────────────────────────────

function initOCRFrame() {
  if (state.ocrFrame) return;

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('ocr/ocr-frame.html');
  frame.setAttribute('aria-hidden', 'true');
  // visibility:hidden keeps the frame loaded and functional (unlike display:none which
  // some browsers defer). Position it off-screen so it never affects layout.
  frame.style.cssText = [
    'position:fixed',
    'top:-9999px',
    'left:-9999px',
    'width:1px',
    'height:1px',
    'border:none',
    'visibility:hidden',
    'pointer-events:none'
  ].join(';');
  (document.body || document.documentElement).appendChild(frame);
  state.ocrFrame = frame;
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'MT_OCR_READY') {
    state.ocrReady = true;
    return;
  }

  if (msg.type === 'MT_OCR_PROGRESS' && activeLoader) {
    const pct = Math.round((msg.progress || 0) * 100);
    const labels = {
      'loading tesseract core': `Chargement du moteur OCR… ${pct}%`,
      'loading language traineddata': `Téléchargement des données linguistiques… ${pct}%`,
      'initializing tesseract': `Initialisation… ${pct}%`,
      'initializing api': `Initialisation… ${pct}%`,
      'recognizing text': `Reconnaissance du texte… ${pct}%`
    };
    const text = labels[msg.status] || `OCR en cours… ${pct}%`;
    const subText = pct < 100 ? 'Patientez, le premier lancement télécharge les données OCR (~4 Mo)' : '';
    activeLoader.update(text, msg.progress, subText);
    return;
  }

  if (msg.type === 'MT_OCR_RESULT') {
    const cb = state.ocrCallbacks.get(msg.id);
    if (!cb) return;
    state.ocrCallbacks.delete(msg.id);
    if (msg.error) cb.reject(new Error(msg.error));
    else cb.resolve(msg.blocks);
  }
});

function waitForOCRReady(timeoutMs = 30000) {
  if (state.ocrReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (state.ocrReady) { resolve(); return; }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("La frame OCR n'a pas répondu (timeout 30s)"));
        return;
      }
      setTimeout(check, 150);
    };
    check();
  });
}

async function runOCR(imageData, lang, loader) {
  initOCRFrame();

  if (loader) loader.update('Connexion au moteur OCR…', 0);
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
  // Method 1: Direct canvas — works for same-origin or CORS-enabled images.
  try {
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w === 0 || h === 0) throw new Error('zero size');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/png'); // throws SecurityError if cross-origin tainted
  } catch {
    // Fall through to Method 2
  }

  // Method 2: Screenshot + crop via captureVisibleTab.
  // The browser has already loaded and rendered the image — no network request needed,
  // so hotlink protection (403 Referer check) is completely bypassed.
  img.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  await new Promise(r => setTimeout(r, 180)); // let the browser finish scrolling

  const rect = img.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    throw new Error("L'image n'est pas visible dans la fenêtre");
  }

  const result = await chrome.runtime.sendMessage({
    action: 'captureImageRegion',
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    dpr: window.devicePixelRatio || 1
  });

  if (result?.dataUrl) return result.dataUrl;
  throw new Error(result?.error || "Échec de la capture d'écran");
}

function findImageBySrc(srcUrl) {
  if (!srcUrl) return null;
  return Array.from(document.querySelectorAll('img')).find(
    img => img.src === srcUrl || img.currentSrc === srcUrl
  ) || null;
}

// ─── Translation ───────────────────────────────────────────────────────────────

// Multiple Lingva public instances — tried in order until one succeeds
const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.gaais.me',
  'https://translate.plausibility.cloud'
];

async function translate(text, settings) {
  const { sourceLang, targetLang, translationApi, translationEndpoint, deepLKey } = settings;
  if (!text.trim()) return text;
  try {
    switch (translationApi) {
      case 'deepl':
        if (deepLKey) return await translateDeepL(text, sourceLang, targetLang, deepLKey);
        // No key → fall through to Lingva
        // falls through
      case 'lingva':
      default:
        try {
          return await translateLingva(text, sourceLang, targetLang);
        } catch {
          // Lingva failed → fallback to MyMemory
          return await translateMyMemory(text, sourceLang, targetLang);
        }
      case 'mymemory':
        return await translateMyMemory(text, sourceLang, targetLang);
      case 'libretranslate':
        if (translationEndpoint) {
          return await translateLibreTranslate(text, sourceLang, targetLang, translationEndpoint);
        }
        return await translateLingva(text, sourceLang, targetLang);
    }
  } catch {
    return text;
  }
}

// Lingva Translate — free, no key, community-hosted instances
async function translateLingva(text, src, tgt) {
  for (const base of LINGVA_INSTANCES) {
    try {
      const res = await fetch(
        `${base}/api/v1/${src}/${tgt}/${encodeURIComponent(text)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.translation) return data.translation;
      throw new Error('Réponse vide');
    } catch {
      // Try next instance
    }
  }
  throw new Error('Toutes les instances Lingva ont échoué');
}

// DeepL Free — 500 000 chars/mois, clé gratuite sur deepl.com
async function translateDeepL(text, src, tgt, apiKey) {
  // DeepL expects uppercase ISO codes. Target French variant = FR, not fr-FR.
  const toDeepL = code => code.toUpperCase().split('-')[0];
  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      text,
      source_lang: toDeepL(src),
      target_lang: toDeepL(tgt)
    }).toString()
  });
  if (!res.ok) {
    const msg = res.status === 403
      ? 'Clé DeepL invalide ou quota dépassé'
      : `DeepL HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  return data.translations[0].text;
}

// MyMemory — gratuit jusqu'à 5 000 chars/jour par IP
async function translateMyMemory(text, src, tgt) {
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = await res.json();
  if (data.responseStatus === 200) return data.responseData.translatedText;
  throw new Error(data.responseMessage || 'MyMemory error');
}

// LibreTranslate — auto-hébergé ou instance publique
async function translateLibreTranslate(text, src, tgt, endpoint) {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' })
  });
  if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
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

  const header = document.createElement('div');
  header.className = 'mt-overlay-header';

  const btnMinimize = makeBtn('−', 'mt-btn', 'Réduire', () => {
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    btnMinimize.textContent = hidden ? '−' : '+';
  });

  const btnClose = makeBtn('×', 'mt-btn', 'Fermer', () => {
    el.remove();
    state.overlays = state.overlays.filter(o => o !== el);
  });

  header.append(btnMinimize, btnClose);

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
    ox = e.clientX; oy = e.clientY;
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

// ─── Main actions ──────────────────────────────────────────────────────────────

async function translateImage(imageEl) {
  if (!imageEl) {
    notify("Aucune image sélectionnée — survolez l'image avant de cliquer", 'error');
    return;
  }

  await loadSettings();

  const loader = createLoader();
  loader.update('Lecture de l\'image…', 0);

  let dataUrl;
  try {
    dataUrl = await getImageDataUrl(imageEl);
  } catch (err) {
    loader.remove();
    notify(`Impossible de lire l'image : ${err.message}`, 'error');
    return;
  }

  loader.update('Connexion au moteur OCR…', 0.02);

  let blocks;
  try {
    blocks = await runOCR(dataUrl, state.settings.ocrLang, loader);
  } catch (err) {
    loader.remove();
    notify(`Erreur OCR : ${err.message}`, 'error');
    return;
  }

  if (!blocks || blocks.length === 0) {
    loader.remove();
    notify("Aucun texte détecté dans l'image", 'warning');
    return;
  }

  loader.update(`${blocks.length} bloc(s) trouvé(s) — traduction…`, 1, '');
  const rect = imageEl.getBoundingClientRect();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    loader.update(
      `Traduction ${i + 1} / ${blocks.length}…`,
      1,
      block.text.slice(0, 50) + (block.text.length > 50 ? '…' : '')
    );
    const translated = await translate(block.text, state.settings);
    createOverlay(block, translated, rect, imageEl);
  }

  loader.remove();
  notify(`Traduction terminée — ${blocks.length} bloc(s)`, 'success');
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

  notify(`Traduction de ${images.length} image(s) en cours…`, 'info');
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
