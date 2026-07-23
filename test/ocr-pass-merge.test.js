'use strict';

// Covers the "double OCR et comparer les résultats" request: deep-scan mode
// runs OCR at several rotation angles and merges the results, deduping
// re-detections of the same text while keeping genuinely new text (e.g. a
// tilted sign only readable once rotated to horizontal). See USER_STORIES.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserGlobals } = require('./helpers/browser-globals');

installBrowserGlobals();
const { mergeBlockPasses, normalizeForCompare } = require('../ocr/ocr-frame.js');

test('normalizeForCompare: lowercases and strips punctuation', () => {
  assert.equal(normalizeForCompare('DOCTOR! THE'), 'doctor the');
  assert.equal(normalizeForCompare('  Emergency, Room.  '), 'emergency room');
});

test('mergeBlockPasses: collapses the same text re-read at 0° and rotated, keeps the more confident one', () => {
  const pass0 = [{ text: 'DOCTOR! THE PATIENT IS BREATHING!', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, confidence: 60 }];
  const pass1 = [{ text: 'DOCTOR! THE PATIENT IS BREATHING!', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, confidence: 88 }];

  const merged = mergeBlockPasses([pass0, pass1]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].confidence, 88);
});

test('mergeBlockPasses: keeps text found in only one pass (tilted sign)', () => {
  const pass0 = [{ text: 'DOCTOR! THE PATIENT IS BREATHING!', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, confidence: 90 }];
  const passRotated = [
    { text: 'EMERGENCY ROOM', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, confidence: 70 }
  ];

  const merged = mergeBlockPasses([pass0, passRotated]);

  assert.equal(merged.length, 2);
  assert.deepEqual(new Set(merged.map(b => b.text)), new Set(['DOCTOR! THE PATIENT IS BREATHING!', 'EMERGENCY ROOM']));
});

test('mergeBlockPasses: near-duplicate readings (OCR misread one word) are still collapsed', () => {
  const pass0 = [{
    text: 'DOCTOR THE PATIENT IS HAVING TROUBLE BREATHING',
    bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    confidence: 55
  }];
  // Same sentence, "IS" misread as "/5" in this pass — most words still match.
  const pass1 = [{
    text: 'DOCTOR THE PATIENT /5 HAVING TROUBLE BREATHING',
    bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    confidence: 75
  }];

  const merged = mergeBlockPasses([pass0, pass1]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].confidence, 75);
});

test('mergeBlockPasses: empty passes produce no blocks', () => {
  assert.deepEqual(mergeBlockPasses([[], []]), []);
});
