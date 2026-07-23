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
    textColor: '#e8e8f0',
    deepScan: false
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
    // Deep-scan mode runs several rotation passes — prefix with which one is running.
    const passPrefix = msg.pass ? `[Passe ${msg.pass.index}/${msg.pass.total}] ` : '';
    const subText = pct < 100 ? 'Patientez, le premier lancement télécharge les données OCR (~4 Mo)' : '';
    activeLoader.update(passPrefix + text, msg.progress, subText);
    return;
  }

  if (msg.type === 'MT_OCR_RESULT') {
    const cb = state.ocrCallbacks.get(msg.id);
    if (!cb) return;
    state.ocrCallbacks.delete(msg.id);
    if (msg.debug) console.log('[MT] OCR debug:', msg.debug);
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

async function runOCR(imageData, lang, loader, deepScan) {
  initOCRFrame();

  if (loader) loader.update('Connexion au moteur OCR…', 0);
  await waitForOCRReady();

  const id = ++state.ocrRequestId;
  return new Promise((resolve, reject) => {
    state.ocrCallbacks.set(id, { resolve, reject });
    state.ocrFrame.contentWindow.postMessage(
      { type: 'MT_OCR_REQUEST', id, imageData, lang, deepScan },
      '*'
    );
  });
}

// ─── Image helpers ─────────────────────────────────────────────────────────────

async function getImageDataUrl(img, loader) {
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

  // Method 2: Background fetch — fast path for CDNs that don't use hotlink protection.
  const src = img.currentSrc || img.src || '';
  if (src.startsWith('http')) {
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'fetchImageAsDataUrl',
        url: src,
        referrer: window.location.href
      });
      if (result?.dataUrl) {
        console.log('[MT] fetchImageAsDataUrl → OK (full image)');
        return result.dataUrl;
      }
      console.warn('[MT] fetchImageAsDataUrl → échec:', result?.error);
    } catch (e) {
      console.warn('[MT] fetchImageAsDataUrl → exception:', e.message);
    }
  }

  // Method 3: Scroll-and-stitch — scrolls through the full image and stitches viewport
  // screenshots together. Works for all images regardless of hotlink protection or CORS.
  return captureFullImageByScrolling(img, loader);
}

// Waits for the image to finish loading. Lazy-loaded <img> elements (loading="lazy",
// or JS lazy-load libraries that swap `src` on scroll) can still be mid-load right
// after scrollIntoView(), leaving naturalWidth/Height at 0 — which downstream sized
// the stitch canvas to 0×0 and failed silently instead of a clear error.
function ensureImageLoaded(img, timeoutMs = 5000) {
  if (img.complete) return Promise.resolve();
  return new Promise(resolve => {
    const cleanup = () => {
      clearTimeout(timer);
      img.removeEventListener('load', onDone);
      img.removeEventListener('error', onDone);
    };
    const onDone = () => { cleanup(); resolve(); };
    // Resolve rather than reject on timeout/error — the dimension check right
    // after the call reports a precise error if the image truly has no size.
    const timer = setTimeout(onDone, timeoutMs);
    img.addEventListener('load', onDone);
    img.addEventListener('error', onDone);
  });
}

async function captureFullImageByScrolling(img, loader) {
  const savedY = window.scrollY;
  const dpr   = window.devicePixelRatio || 1;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;

  img.scrollIntoView({ behavior: 'instant', block: 'start' });
  await new Promise(r => setTimeout(r, 200));
  await ensureImageLoaded(img);

  const firstRect = img.getBoundingClientRect();
  const displayW  = firstRect.width;
  const displayH  = firstRect.height;

  if (displayW <= 0 || displayH <= 0) throw new Error("Image non visible");

  const natW = img.naturalWidth  || displayW;
  const natH = img.naturalHeight || displayH;
  if (natW <= 0 || natH <= 0) throw new Error("Dimensions de l'image indisponibles");

  // Single-capture path — image fits in the viewport.
  if (displayH <= vh) {
    const r = {
      left:   Math.max(0, firstRect.left),
      top:    Math.max(0, firstRect.top),
      width:  Math.min(firstRect.right, vw) - Math.max(0, firstRect.left),
      height: Math.min(firstRect.bottom, vh) - Math.max(0, firstRect.top)
    };
    const res = await chrome.runtime.sendMessage({ action: 'captureImageRegion', rect: r, dpr });
    window.scrollTo(0, savedY);
    if (res?.dataUrl) return res.dataUrl;
    throw new Error(res?.error || "Échec de la capture");
  }

  // Multi-capture path — stitch at natural pixel dimensions without extra upscale.
  const scaleY      = natH / displayH;
  const totalChunks = Math.ceil(displayH / vh);
  const canvas = document.createElement('canvas');
  canvas.width  = natW;
  canvas.height = natH;
  const ctx = canvas.getContext('2d');

  let chunkIndex  = 0;
  let capturedNatH = 0;

  while (capturedNatH < natH) {
    const rect       = img.getBoundingClientRect();
    const imgTopInVP = rect.top;
    const visTop     = Math.max(0, imgTopInVP);
    const visBottom  = Math.min(vh, imgTopInVP + displayH);
    const visH       = visBottom - visTop;

    if (visH <= 2) break;

    loader?.update(
      `Capture ${chunkIndex + 1}/${totalChunks}…`,
      0.05 + 0.35 * (chunkIndex / totalChunks)
    );

    const res = await chrome.runtime.sendMessage({
      action: 'captureImageRegion',
      rect: { left: Math.max(0, rect.left), top: visTop, width: Math.min(rect.width, vw), height: visH },
      dpr,
      upscale: 1
    });

    if (!res?.dataUrl) break;

    const imgDisplayYStart = Math.max(0, -imgTopInVP);
    const destY = Math.round(imgDisplayYStart * scaleY);
    const destH = Math.min(Math.round(visH * scaleY), natH - destY);

    await new Promise((resolve, reject) => {
      const chunk = new Image();
      chunk.onload  = () => { ctx.drawImage(chunk, 0, destY, natW, destH); resolve(); };
      chunk.onerror = () => reject(new Error('Erreur chargement chunk'));
      chunk.src = res.dataUrl;
    });

    capturedNatH = destY + destH;
    chunkIndex++;
    if (capturedNatH >= natH) break;

    window.scrollBy(0, Math.floor(visH * 0.95));
    await new Promise(r => setTimeout(r, 150));
  }

  window.scrollTo(0, savedY);

  if (capturedNatH === 0) throw new Error("Aucune capture réussie");
  return canvas.toDataURL('image/png');
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
  'https://translate.plausibility.cloud'
];

// ─── Circuit breaker ─────────────────────────────────────────────────────────────
// Once a service fails, skip it for PROVIDER_COOLDOWN_MS instead of retrying it on
// every single block/image — without this, an outage (e.g. Lingva down) meant every
// block of every image on a page re-attempted the same dead instances from scratch.
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const providerCooldowns = new Map(); // providerKey → timestamp (ms) until which it's skipped

function isProviderCoolingDown(key) {
  const until = providerCooldowns.get(key);
  return until !== undefined && Date.now() < until;
}

function markProviderDown(key) {
  providerCooldowns.set(key, Date.now() + PROVIDER_COOLDOWN_MS);
}

function markProviderUp(key) {
  providerCooldowns.delete(key);
}

// ─── Translation provider chain ─────────────────────────────────────────────────
// The user's chosen service is tried first; on failure we cascade through the
// other configured services rather than silently giving up or returning the
// untranslated text. We stop after MAX_PROVIDER_FAILURES services have failed
// so a full outage surfaces as a clear error instead of retrying forever.
const MAX_PROVIDER_FAILURES = 3;

function buildProviderChain(settings) {
  const { translationApi, translationEndpoint, deepLKey } = settings;

  const providers = {
    lingva: {
      name: 'Lingva',
      run: (text, src, tgt) => translateLingva(text, src, tgt)
    },
    mymemory: {
      name: 'MyMemory',
      run: (text, src, tgt) => translateMyMemory(text, src, tgt)
    },
    deepl: {
      name: 'DeepL',
      available: !!deepLKey,
      run: (text, src, tgt) => translateDeepL(text, src, tgt, deepLKey)
    },
    libretranslate: {
      name: 'LibreTranslate',
      available: !!translationEndpoint,
      run: (text, src, tgt) => translateLibreTranslate(text, src, tgt, translationEndpoint)
    }
  };

  // Preferred provider first (if usable), then the others as fallback, in a fixed
  // order — skipping ones that aren't configured (no DeepL key / no LibreTranslate endpoint).
  const order = [translationApi, 'lingva', 'mymemory', 'deepl', 'libretranslate'];
  const seen = new Set();
  const usable = [];
  for (const key of order) {
    if (seen.has(key) || !providers[key]) continue;
    seen.add(key);
    if (providers[key].available === false) continue;
    usable.push({ key, ...providers[key] });
  }

  // Skip services still cooling down after a recent failure — unless that would
  // leave nothing to try, in which case attempt them anyway (a possibly-recovered
  // service is worth retrying rather than failing immediately with nothing tried).
  const ready = usable.filter(p => !isProviderCoolingDown(p.key));
  return ready.length > 0 ? ready : usable;
}

async function translate(text, settings) {
  if (!text.trim()) return text;

  const chain = buildProviderChain(settings);
  const failures = [];

  for (const provider of chain) {
    if (failures.length >= MAX_PROVIDER_FAILURES) break;
    try {
      const result = await provider.run(text, settings.sourceLang, settings.targetLang);
      markProviderUp(provider.key);
      return result;
    } catch (err) {
      console.warn(`[MT] Service de traduction "${provider.name}" en échec :`, err.message);
      markProviderDown(provider.key);
      failures.push(`${provider.name} (${err.message})`);
    }
  }

  throw new Error(`Tous les services de traduction disponibles ont échoué — ${failures.join(', ')}`);
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

// ─── Modal de traduction ────────────────────────────────────────────────────────

// `groups`, if provided, is an array of { imageIndex, results } used to label
// which source image each block came from (batch translation via translatePage).
// Without it, `results` renders as a flat list (single-image translation).
function showTranslationModal(results, groups) {
  const s = state.settings;

  const el = document.createElement('div');
  el.className = 'mt-modal';
  el.style.cssText = `font-size:${s.fontSize}px;` +
    `background:${hexToRgba(s.bgColor, s.opacity)};color:${s.textColor};`;

  const header = document.createElement('div');
  header.className = 'mt-modal-header';

  const title = document.createElement('span');
  title.className = 'mt-modal-title';
  title.textContent = groups
    ? `Traduction — ${groups.length} image(s), ${results.length} bloc${results.length > 1 ? 's' : ''}`
    : `Traduction — ${results.length} bloc${results.length > 1 ? 's' : ''}`;

  const btnClose = makeBtn('×', 'mt-btn', 'Fermer', () => {
    el.remove();
    state.overlays = state.overlays.filter(o => o !== el);
  });

  header.append(title, btnClose);

  const body = document.createElement('div');
  body.className = 'mt-modal-body';

  const appendBlock = ({ original, translated }) => {
    const block = document.createElement('div');
    block.className = 'mt-block';

    const origEl = document.createElement('p');
    origEl.className = 'mt-original';
    origEl.textContent = original;

    const transEl = document.createElement('p');
    transEl.className = 'mt-translated';
    transEl.textContent = translated;

    block.append(origEl, transEl);
    body.appendChild(block);
  };

  if (groups) {
    for (const group of groups) {
      const groupTitle = document.createElement('div');
      groupTitle.className = 'mt-group-title';
      groupTitle.textContent = `Image ${group.imageIndex}`;
      body.appendChild(groupTitle);
      group.results.forEach(appendBlock);
    }
  } else {
    results.forEach(appendBlock);
  }

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
    // Resolve the current viewport position (works whether the modal is
    // centered via CSS transform or already placed via left/top from a prior drag).
    const r = el.getBoundingClientRect();
    ol = r.left; ot = r.top;
    // Drop the centering transform so left/top take full control.
    el.style.transform = 'none';
    el.style.left = `${ol}px`;
    el.style.top = `${ot}px`;
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

// Runs OCR + translation for a single image against an existing loader and
// returns the translated blocks. Throws on hard failure (unreadable image, OCR
// error); returns [] when the image is read fine but no text is detected.
// Shared by translateImage (single image) and translatePage (batch) so a batch
// run uses one loader and one result set instead of one modal per image.
async function runOCRTranslatePipeline(imageEl, loader) {
  let dataUrl;
  try {
    dataUrl = await getImageDataUrl(imageEl, loader);
  } catch (err) {
    throw new Error(`Impossible de lire l'image : ${err.message}`);
  }

  loader.update('Connexion au moteur OCR…', 0.02);

  let blocks;
  try {
    blocks = await runOCR(dataUrl, state.settings.ocrLang, loader, state.settings.deepScan);
  } catch (err) {
    throw new Error(`Erreur OCR : ${err.message}`);
  }

  if (!blocks || blocks.length === 0) return [];

  loader.update(`${blocks.length} bloc(s) trouvé(s) — traduction…`, 1, '');

  const results = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    loader.update(
      `Traduction ${i + 1} / ${blocks.length}…`,
      1,
      block.text.slice(0, 50) + (block.text.length > 50 ? '…' : '')
    );
    const translated = await translate(block.text, state.settings);
    results.push({ original: block.text, translated });
  }
  return results;
}

async function translateImage(imageEl) {
  if (!imageEl) {
    notify("Aucune image sélectionnée — survolez l'image avant de cliquer", 'error');
    return;
  }

  await loadSettings();

  const loader = createLoader();
  loader.update('Lecture de l\'image…', 0);

  let results;
  try {
    results = await runOCRTranslatePipeline(imageEl, loader);
  } catch (err) {
    loader.remove();
    notify(err.message, 'error');
    return;
  }

  loader.remove();

  if (results.length === 0) {
    notify("Aucun texte détecté dans l'image", 'warning');
    return;
  }

  showTranslationModal(results);
  notify(`Traduction terminée — ${results.length} bloc(s)`, 'success');
}

async function translatePage() {
  await loadSettings();

  // Deduplicate by resolved src — webtoon pages often have the same <img> several
  // times in the DOM (lazy-load placeholders, hidden clones, srcset duplicates).
  const seen = new Set();
  const images = Array.from(document.querySelectorAll('img')).filter(img => {
    if (img.offsetWidth < 100 || img.offsetHeight < 100) return false;
    if (img.closest('.mt-modal')) return false;
    const src = img.currentSrc || img.src || '';
    if (!src || seen.has(src)) return false;
    seen.add(src);
    return true;
  });

  if (images.length === 0) {
    notify('Aucune image de taille suffisante trouvée', 'warning');
    return;
  }

  // One shared loader and one combined modal for the whole batch — translating
  // each image via translateImage() used to pop a separate centered modal per
  // image, stacking them on top of each other for multi-image pages.
  const loader = createLoader();
  const groups = [];
  let failCount = 0;

  for (let i = 0; i < images.length; i++) {
    loader.update(`Image ${i + 1} / ${images.length}…`, 0, '');
    try {
      const results = await runOCRTranslatePipeline(images[i], loader);
      if (results.length > 0) groups.push({ imageIndex: i + 1, results });
    } catch (err) {
      failCount++;
      console.warn(`[MT] Image ${i + 1}/${images.length} échouée :`, err.message);
    }
  }

  loader.remove();

  if (groups.length === 0) {
    notify("Aucun texte détecté dans les images de la page", 'warning');
    return;
  }

  const blockCount = groups.reduce((n, g) => n + g.results.length, 0);
  showTranslationModal(groups.flatMap(g => g.results), groups.length > 1 ? groups : undefined);

  const failSuffix = failCount > 0 ? ` — ${failCount} image(s) en échec` : '';
  notify(`Traduction terminée — ${blockCount} bloc(s) sur ${groups.length} image(s)${failSuffix}`, 'success');
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

// Node-only export for unit tests (node:test) — no-op in the browser/content-script context.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildProviderChain,
    translate,
    hexToRgba,
    defaultSettings,
    MAX_PROVIDER_FAILURES,
    PROVIDER_COOLDOWN_MS,
    isProviderCoolingDown,
    // Test-only: clears circuit-breaker state so tests don't leak cooldowns into each other.
    __resetProviderCooldownsForTests: () => providerCooldowns.clear()
  };
}
