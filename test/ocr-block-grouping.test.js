'use strict';

// Covers the "grouper les blocs de texte au lieu d'envoyer ligne par ligne"
// request: Tesseract (PSM 11) often splits one wrapped speech bubble into one
// paragraph per line, which loses sentence context when each line is
// translated separately. See USER_STORIES.md epic 7.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserGlobals } = require('./helpers/browser-globals');

installBrowserGlobals();
const { groupBlocksByProximity } = require('../ocr/ocr-frame.js');

test('groupBlocksByProximity: merges stacked lines of the same speech bubble', () => {
  // Reproduces the real capture: "DOCTOR! THE" / "PATIENT IS" / "HAVING TROUBLE" /
  // "BREATHING!" read as 4 separate paragraphs, all in the same bubble column.
  const blocks = [
    { text: 'DOCTOR! THE', bbox: { x0: 400, y0: 490, x1: 800, y1: 530 }, confidence: 95 },
    { text: 'PATIENT IS', bbox: { x0: 410, y0: 535, x1: 790, y1: 575 }, confidence: 85 },
    { text: 'HAVING TROUBLE', bbox: { x0: 420, y0: 580, x1: 770, y1: 620 }, confidence: 80 },
    { text: 'BREATHING!', bbox: { x0: 400, y0: 625, x1: 800, y1: 665 }, confidence: 90 }
  ];

  const groups = groupBlocksByProximity(blocks);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].text, 'DOCTOR! THE PATIENT IS HAVING TROUBLE BREATHING!');
});

test('groupBlocksByProximity: keeps a distant, non-overlapping block separate', () => {
  const bubble = [
    { text: 'DOCTOR! THE', bbox: { x0: 400, y0: 490, x1: 800, y1: 530 }, confidence: 95 },
    { text: 'BREATHING!', bbox: { x0: 400, y0: 535, x1: 800, y1: 575 }, confidence: 90 }
  ];
  // "EMERGENCY ROOM" sign — far below, different horizontal column.
  const sign = { text: 'EMERGENCY ROOM', bbox: { x0: 50, y0: 900, x1: 350, y1: 1000 }, confidence: 70 };

  const groups = groupBlocksByProximity([...bubble, sign]);

  assert.equal(groups.length, 2);
  const texts = groups.map(g => g.text);
  assert.ok(texts.includes('DOCTOR! THE BREATHING!'));
  assert.ok(texts.includes('EMERGENCY ROOM'));
});

test('groupBlocksByProximity: does not merge lines in different horizontal columns', () => {
  // Two side-by-side bubbles at the same height must stay separate.
  const left = { text: 'HELLO', bbox: { x0: 0, y0: 100, x1: 100, y1: 140 }, confidence: 90 };
  const right = { text: 'WORLD', bbox: { x0: 300, y0: 105, x1: 400, y1: 145 }, confidence: 90 };

  const groups = groupBlocksByProximity([left, right]);

  assert.equal(groups.length, 2);
});

test('groupBlocksByProximity: single block is returned unchanged', () => {
  const block = { text: 'SOLO', bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, confidence: 90 };
  assert.deepEqual(groupBlocksByProximity([block]), [block]);
});

test('groupBlocksByProximity: averages confidence across merged lines', () => {
  const blocks = [
    { text: 'A', bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }, confidence: 80 },
    { text: 'B', bbox: { x0: 0, y0: 22, x1: 50, y1: 42 }, confidence: 60 }
  ];
  const groups = groupBlocksByProximity(blocks);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].confidence, 70);
});
