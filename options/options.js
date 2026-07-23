'use strict';

const DEFAULTS = {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function applyToForm(settings) {
  $('ocr-lang').value        = settings.ocrLang;
  $('deep-scan').checked     = !!settings.deepScan;
  $('source-lang').value     = settings.sourceLang;
  $('target-lang').value     = settings.targetLang;
  $('translation-api').value = settings.translationApi;
  $('deepl-key').value       = settings.deepLKey || '';
  $('translation-endpoint').value = settings.translationEndpoint || '';

  $('font-size').value = settings.fontSize;
  $('font-size-val').textContent = settings.fontSize;

  const opacityPct = Math.round(settings.opacity * 100);
  $('opacity').value = opacityPct;
  $('opacity-val').textContent = opacityPct;

  $('bg-color').value   = settings.bgColor;
  $('text-color').value = settings.textColor;

  updateApiFields(settings.translationApi);
}

function readFromForm() {
  return {
    ocrLang:            $('ocr-lang').value,
    deepScan:           $('deep-scan').checked,
    sourceLang:         $('source-lang').value,
    targetLang:         $('target-lang').value,
    translationApi:     $('translation-api').value,
    deepLKey:           $('deepl-key').value.trim(),
    translationEndpoint: $('translation-endpoint').value.trim(),
    fontSize:           parseInt($('font-size').value, 10),
    opacity:            parseInt($('opacity').value, 10) / 100,
    bgColor:            $('bg-color').value,
    textColor:          $('text-color').value
  };
}

function updateApiFields(api) {
  // Show/hide conditional fields
  $('field-deepl-key').style.display  = api === 'deepl'          ? '' : 'none';
  $('field-endpoint').style.display   = api === 'libretranslate' ? '' : 'none';

  // Show the right hint
  $('api-hint-lingva').style.display    = api === 'lingva'    ? '' : 'none';
  $('api-hint-deepl').style.display     = api === 'deepl'     ? '' : 'none';
  $('api-hint-mymemory').style.display  = api === 'mymemory'  ? '' : 'none';
}

// ─── Load ──────────────────────────────────────────────────────────────────────

chrome.storage.local.get('settings', data => {
  applyToForm({ ...DEFAULTS, ...(data.settings || {}) });
});

// ─── Live feedback ─────────────────────────────────────────────────────────────

$('font-size').addEventListener('input', e => {
  $('font-size-val').textContent = e.target.value;
});

$('opacity').addEventListener('input', e => {
  $('opacity-val').textContent = e.target.value;
});

$('translation-api').addEventListener('change', e => {
  updateApiFields(e.target.value);
});

// ─── Save ──────────────────────────────────────────────────────────────────────

$('form-settings').addEventListener('submit', e => {
  e.preventDefault();
  const settings = readFromForm();

  // Warn if DeepL selected but no key
  if (settings.translationApi === 'deepl' && !settings.deepLKey) {
    const fb = $('save-feedback');
    fb.style.color = '#c5221f';
    fb.textContent = '⚠ Clé DeepL manquante — Lingva sera utilisé en fallback';
    setTimeout(() => { fb.textContent = ''; fb.style.color = ''; }, 3500);
  }

  chrome.storage.local.set({ settings }, () => {
    const fb = $('save-feedback');
    fb.style.color = '';
    fb.textContent = '✓ Paramètres enregistrés';
    setTimeout(() => { fb.textContent = ''; }, 2500);
  });
});

// ─── Reset ─────────────────────────────────────────────────────────────────────

$('btn-reset').addEventListener('click', () => {
  if (confirm('Réinitialiser tous les paramètres par défaut ?')) {
    applyToForm(DEFAULTS);
  }
});
