#!/usr/bin/env node
// Setup script: copies Tesseract.js files from node_modules to lib/
// and generates PNG icons.
// Run: node scripts/setup.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'lib');
const ICONS = path.join(ROOT, 'icons');

// ─── Tesseract.js ─────────────────────────────────────────────────────────────

function copyTesseract() {
  const tessDir = path.join(ROOT, 'node_modules', 'tesseract.js', 'dist');

  if (!fs.existsSync(tessDir)) {
    console.error('❌  tesseract.js not found in node_modules. Run: npm install');
    process.exit(1);
  }

  const files = [
    'tesseract.min.js',
    'worker.min.js'
  ];

  let copied = 0;
  for (const file of files) {
    const src = path.join(tessDir, file);
    const dst = path.join(LIB, file);
    if (!fs.existsSync(src)) {
      console.warn(`⚠   Not found: ${file} (skipping)`);
      continue;
    }
    fs.copyFileSync(src, dst);
    const size = (fs.statSync(dst).size / 1024).toFixed(0);
    console.log(`✓  lib/${file} (${size} kB)`);
    copied++;
  }

  // Also copy tesseract-core files if present (optional — falls back to CDN)
  const coreFiles = fs.readdirSync(tessDir).filter(f =>
    f.startsWith('tesseract-core') || f.endsWith('.wasm')
  );

  for (const file of coreFiles) {
    const src = path.join(tessDir, file);
    const dst = path.join(LIB, file);
    fs.copyFileSync(src, dst);
    const size = (fs.statSync(dst).size / 1024).toFixed(0);
    console.log(`✓  lib/${file} (${size} kB)`);
    copied++;
  }

  console.log(`\nTesseract.js: ${copied} fichier(s) copié(s) dans lib/`);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function generateIcons() {
  // Attempt to use Jimp (optional devDependency)
  let Jimp;
  try {
    Jimp = require('jimp');
  } catch {
    console.log('\n⚠  Jimp non trouvé — les icônes PNG ne seront pas générées.');
    console.log('   Ajoutez vos propres icônes dans icons/ (16, 48, 128 px).');
    console.log('   Pour les générer: npm install --save-dev jimp && node scripts/setup.js\n');
    createPlaceholderIcons();
    return;
  }

  const { Jimp: JimpClass } = Jimp;
  const sizes = [16, 32, 48, 128];
  const promises = sizes.map(async size => {
    const img = new JimpClass({ width: size, height: size, color: 0x1a1a2eff });
    await img.write(path.join(ICONS, `icon-${size}.png`));
    console.log(`✓  icons/icon-${size}.png`);
  });

  Promise.all(promises).then(() => {
    console.log('\nIcônes générées (couleur unie — personnalisez icons/ si souhaité)');
  });
}

function createPlaceholderIcons() {
  // Tiny valid PNG (1×1 pixel, dark blue) encoded as base64
  // Generated offline and hardcoded to avoid any dependency
  const SIZES = [16, 32, 48, 128];

  // Minimal 1×1 transparent PNG (we resize with CSS in the browser; good enough for dev)
  const MINI_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const buf = Buffer.from(MINI_PNG_B64, 'base64');

  for (const size of SIZES) {
    const iconPath = path.join(ICONS, `icon-${size}.png`);
    if (!fs.existsSync(iconPath)) {
      fs.writeFileSync(iconPath, buf);
      console.log(`✓  icons/icon-${size}.png (placeholder 1×1)`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('=== Manga Translator — Setup ===\n');

if (!fs.existsSync(LIB)) fs.mkdirSync(LIB, { recursive: true });
if (!fs.existsSync(ICONS)) fs.mkdirSync(ICONS, { recursive: true });

copyTesseract();
generateIcons();

console.log('\n✅  Setup terminé.');
console.log('   Chargez le dossier dans chrome://extensions (mode développeur)');
console.log('   ou about:debugging#/runtime/this-firefox\n');
