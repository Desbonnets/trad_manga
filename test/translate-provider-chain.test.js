'use strict';

// Covers US-16 (bascule automatique vers un autre service) and US-17 (erreur claire
// après 3 services en échec) from USER_STORIES.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installBrowserGlobals } = require('./helpers/browser-globals');

installBrowserGlobals();
const {
  buildProviderChain,
  translate,
  MAX_PROVIDER_FAILURES,
  PROVIDER_COOLDOWN_MS,
  isProviderCoolingDown,
  __resetProviderCooldownsForTests
} = require('../content/content.js');

const baseSettings = {
  sourceLang: 'en',
  targetLang: 'fr',
  translationApi: 'lingva',
  translationEndpoint: '',
  deepLKey: ''
};

// The circuit breaker is module-level state shared across every test in this file —
// reset it before each test so failures/successes in one test don't leak into the next.
test.beforeEach(() => {
  __resetProviderCooldownsForTests();
});

test('MAX_PROVIDER_FAILURES matches the "3 services down" requirement (US-17)', () => {
  assert.equal(MAX_PROVIDER_FAILURES, 3);
});

test('buildProviderChain: default settings only include configured services (US-16 CA3)', () => {
  const chain = buildProviderChain(baseSettings);
  assert.deepEqual(chain.map(p => p.name), ['Lingva', 'MyMemory']);
});

test('buildProviderChain: preferred provider is tried first (US-16 CA1)', () => {
  const chain = buildProviderChain({ ...baseSettings, translationApi: 'mymemory' });
  assert.deepEqual(chain.map(p => p.name), ['MyMemory', 'Lingva']);
});

test('buildProviderChain: DeepL only included when a key is configured (US-16 CA3)', () => {
  const withoutKey = buildProviderChain({ ...baseSettings, translationApi: 'deepl' });
  assert.deepEqual(withoutKey.map(p => p.name), ['Lingva', 'MyMemory']);

  const withKey = buildProviderChain({ ...baseSettings, translationApi: 'deepl', deepLKey: 'secret' });
  assert.deepEqual(withKey.map(p => p.name), ['DeepL', 'Lingva', 'MyMemory']);
});

test('buildProviderChain: LibreTranslate only included when an endpoint is configured (US-16 CA3)', () => {
  const withoutEndpoint = buildProviderChain({ ...baseSettings, translationApi: 'libretranslate' });
  assert.deepEqual(withoutEndpoint.map(p => p.name), ['Lingva', 'MyMemory']);

  const withEndpoint = buildProviderChain({
    ...baseSettings,
    translationApi: 'libretranslate',
    translationEndpoint: 'https://libretranslate.example'
  });
  assert.deepEqual(withEndpoint.map(p => p.name), ['LibreTranslate', 'Lingva', 'MyMemory']);
});

test('buildProviderChain: full chain order when everything is configured', () => {
  const chain = buildProviderChain({
    ...baseSettings,
    translationApi: 'lingva',
    deepLKey: 'secret',
    translationEndpoint: 'https://libretranslate.example'
  });
  assert.deepEqual(chain.map(p => p.name), ['Lingva', 'MyMemory', 'DeepL', 'LibreTranslate']);
});

test('translate: falls back to the next service when the first one fails (US-16 CA1/CA2)', async () => {
  let call = 0;
  global.fetch = async () => {
    call++;
    if (call <= 2) throw new Error('lingva instance down'); // both Lingva instances fail
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'bonjour' } }) };
  };

  const result = await translate('hello', baseSettings);
  assert.equal(result, 'bonjour');
});

test('translate: stops after MAX_PROVIDER_FAILURES services and reports a clear error (US-17 CA1/CA2)', async () => {
  global.fetch = async () => { throw new Error('network down'); };

  const settings = {
    ...baseSettings,
    deepLKey: 'secret',
    translationEndpoint: 'https://libretranslate.example'
  };
  // Chain is [Lingva, MyMemory, DeepL, LibreTranslate] — only the first 3 should be attempted.
  await assert.rejects(
    () => translate('hello', settings),
    err => {
      assert.match(err.message, /Tous les services de traduction disponibles ont échoué/);
      assert.match(err.message, /Lingva/);
      assert.match(err.message, /MyMemory/);
      assert.match(err.message, /DeepL/);
      assert.doesNotMatch(err.message, /LibreTranslate/);
      return true;
    }
  );
});

test('translate: empty/whitespace text is returned unchanged without calling any service', async () => {
  global.fetch = async () => { throw new Error('should not be called'); };
  const result = await translate('   ', baseSettings);
  assert.equal(result, '   ');
});

// ─── Circuit breaker ("ne plus faire appel à un service en panne pendant un certain temps") ───

test('circuit breaker: a failed service is excluded from the chain on the next call', async () => {
  const settings = { ...baseSettings, deepLKey: 'secret' }; // chain: Lingva, MyMemory, DeepL
  let call = 0;
  global.fetch = async () => {
    call++;
    // Both Lingva instances fail (calls 1-2), MyMemory succeeds (call 3) — DeepL never tried.
    if (call <= 2) throw new Error('lingva down');
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'bonjour' } }) };
  };

  const result = await translate('hello', settings);
  assert.equal(result, 'bonjour');
  assert.equal(isProviderCoolingDown('lingva'), true);
  assert.equal(isProviderCoolingDown('mymemory'), false);

  // Next call for the same settings: Lingva is skipped up front while cooling down —
  // no wasted request against a service already known to be down.
  const chain = buildProviderChain(settings);
  assert.deepEqual(chain.map(p => p.name), ['MyMemory', 'DeepL']);
});

test('circuit breaker: a successful service clears its own cooldown (recovery)', async () => {
  const settings = { ...baseSettings, translationApi: 'mymemory' };

  global.fetch = async () => { throw new Error('down'); };
  await assert.rejects(() => translate('hello', settings));
  assert.equal(isProviderCoolingDown('mymemory'), true);

  global.fetch = async () => ({ ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'bonjour' } }) });
  const result = await translate('hello', settings);

  assert.equal(result, 'bonjour');
  assert.equal(isProviderCoolingDown('mymemory'), false);
});

test('circuit breaker: falls back to the full chain rather than offering nothing when everything is cooling down', async () => {
  global.fetch = async () => { throw new Error('down'); };
  await assert.rejects(() => translate('hello', baseSettings)); // puts Lingva + MyMemory on cooldown

  // Both configured services are now cooling down — buildProviderChain must still
  // return them (better to retry a possibly-recovered service than offer nothing).
  const chain = buildProviderChain(baseSettings);
  assert.deepEqual(chain.map(p => p.name), ['Lingva', 'MyMemory']);
});

test('circuit breaker: cooldown duration is a fixed window, not indefinite', () => {
  assert.ok(PROVIDER_COOLDOWN_MS > 0);
  assert.ok(PROVIDER_COOLDOWN_MS < 60 * 60 * 1000); // sanity: under an hour
});
