'use strict';

// Covers US-21 (ne pas traduire le bruit visuel du dessin) from USER_STORIES.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserGlobals } = require('./helpers/browser-globals');

installBrowserGlobals();
const { isLikelyNoise, extractBlocks } = require('../ocr/ocr-frame.js');

test('isLikelyNoise: pure punctuation/symbols is noise regardless of confidence (US-21 CA2)', () => {
  assert.equal(isLikelyNoise('—', 95), true);
  assert.equal(isLikelyNoise('¥', 99), true);
});

test('isLikelyNoise: short fragment with low confidence is noise (US-21 CA1)', () => {
  assert.equal(isLikelyNoise('oN', 40), true);
  assert.equal(isLikelyNoise('00', 20), true);
});

test('isLikelyNoise: 2-3 char fragment with high confidence is kept', () => {
  assert.equal(isLikelyNoise('oN', 80), false);
  assert.equal(isLikelyNoise('K1', 95), false);
});

// Regression test: real manga capture where a stray "K" (misread art artifact)
// scored high enough confidence (>=60) to slip past the short-fragment filter
// and got sent to translation. A single character is never worth translating
// on its own, so it must be filtered regardless of confidence.
test('isLikelyNoise: a single character is always noise, even at high confidence', () => {
  assert.equal(isLikelyNoise('K', 95), true);
  assert.equal(isLikelyNoise('5', 99), true);
});

test('isLikelyNoise: real (longer) text is never filtered as noise (US-21 CA3)', () => {
  assert.equal(isLikelyNoise('DOCTOR! THE', 15), false);
  assert.equal(isLikelyNoise('BREATHING!', 95), false);
});

test('extractBlocks: filters noise paragraphs while keeping real text', () => {
  const data = {
    paragraphs: [
      { text: 'DOCTOR! THE', confidence: 95, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { text: 'oN', confidence: 30, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { text: '—', confidence: 99, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { text: 'BREATHING!', confidence: 60, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }
    ],
    lines: []
  };

  const blocks = extractBlocks(data);
  assert.deepEqual(blocks.map(b => b.text), ['DOCTOR! THE', 'BREATHING!']);
});

test('extractBlocks: falls back to lines when paragraphs are all filtered out', () => {
  const data = {
    paragraphs: [
      { text: '00', confidence: 15, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }
    ],
    lines: [
      { text: 'HAVING TROUBLE', confidence: 45, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }
    ]
  };

  const blocks = extractBlocks(data);
  assert.deepEqual(blocks.map(b => b.text), ['HAVING TROUBLE']);
});

test('extractBlocks: returns nothing when both paragraphs and lines are empty/noisy', () => {
  const data = { paragraphs: [], lines: [{ text: 'K', confidence: 5, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] };
  assert.deepEqual(extractBlocks(data), []);
});

test('extractBlocks: drops a lone letter even at high confidence (real-world regression)', () => {
  const data = {
    paragraphs: [
      { text: 'BREATHING!', confidence: 60, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      { text: 'K', confidence: 90, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }
    ],
    lines: []
  };
  const blocks = extractBlocks(data);
  assert.deepEqual(blocks.map(b => b.text), ['BREATHING!']);
});
