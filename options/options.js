'use strict';

const DEFAULTS = {
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function applyToForm(settings) {
  $('ocr-lang').value = settings.ocrLang;
  $('source-lang').value = settings.sourceLang;
  $('target-lang').value = settings.targetLang;
  $('translation-api').value = settings.translationApi;
  $('translation-endpoint').value = settings.translationEndpoint || '';
  $('font-size').value = settings.fontSize;
  $('font-size-val').textContent = settings.fontSize;
  const opacityPct = Math.round(settings.opacity * 100);
  $('opacity').value = opacityPct;
  $('opacity-val').textContent = opacityPct;
  $('bg-color').value = settings.bgColor;
  $('text-color').value = settings.textColor;
  toggleEndpointField(settings.translationApi);
}

function readFromForm() {
  return {
    ocrLang: $('ocr-lang').value,
    sourceLang: $('source-lang').value,
    targetLang: $('target-lang').value,
    translationApi: $('translation-api').value,
    translationEndpoint: $('translation-endpoint').value.trim(),
    fontSize: parseInt($('font-size').value, 10),
    opacity: parseInt($('opacity').value, 10) / 100,
    bgColor: $('bg-color').value,
    textColor: $('text-color').value
  };
}

function toggleEndpointField(api) {
  $('field-endpoint').style.display = api === 'libretranslate' ? '' : 'none';
}

// ─── Load ──────────────────────────────────────────────────────────────────────

chrome.storage.local.get('settings', data => {
  applyToForm({ ...DEFAULTS, ...(data.settings || {}) });
});

// ─── Live feedback for ranges ──────────────────────────────────────────────────

$('font-size').addEventListener('input', e => {
  $('font-size-val').textContent = e.target.value;
});

$('opacity').addEventListener('input', e => {
  $('opacity-val').textContent = e.target.value;
});

$('translation-api').addEventListener('change', e => {
  toggleEndpointField(e.target.value);
});

// ─── Save ──────────────────────────────────────────────────────────────────────

$('form-settings').addEventListener('submit', e => {
  e.preventDefault();
  const settings = readFromForm();
  chrome.storage.local.set({ settings }, () => {
    const fb = $('save-feedback');
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
