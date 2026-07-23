'use strict';

// Covers US-12 (réglages par défaut sensés) and US-14 (personnalisation de l'apparence)
// from USER_STORIES.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserGlobals } = require('./helpers/browser-globals');

installBrowserGlobals();
const { hexToRgba, defaultSettings } = require('../content/content.js');

test('defaultSettings: provides sane out-of-the-box values (US-12 CA2)', () => {
  const s = defaultSettings();
  assert.equal(s.ocrLang, 'eng');
  assert.equal(s.sourceLang, 'en');
  assert.equal(s.targetLang, 'fr');
  assert.equal(s.translationApi, 'lingva');
  assert.equal(s.deepLKey, '');
  assert.equal(s.translationEndpoint, '');
  assert.ok(s.fontSize > 0);
  assert.ok(s.opacity > 0 && s.opacity <= 1);
});

test('hexToRgba: converts a hex color and applies the requested opacity (US-14 CA2)', () => {
  assert.equal(hexToRgba('#0f0f1a', 0.92), 'rgba(15,15,26,0.92)');
  assert.equal(hexToRgba('#ffffff', 1), 'rgba(255,255,255,1)');
  assert.equal(hexToRgba('#000000', 0), 'rgba(0,0,0,0)');
});
