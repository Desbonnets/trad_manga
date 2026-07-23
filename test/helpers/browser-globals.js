'use strict';

// content.js and ocr/ocr-frame.js are plain browser scripts (no module system) that
// touch `document`/`window`/`chrome` at the top level as soon as they're loaded
// (event listener registration, `window.parent.postMessage`, etc). This installs
// minimal stand-ins so those files can be `require()`-d under Node for unit-testing
// their pure logic (see the `module.exports` guards at the bottom of each file).
function installBrowserGlobals() {
  global.chrome = {
    runtime: {
      onMessage: { addListener: () => {} },
      sendMessage: async () => ({}),
      getURL: p => `chrome-extension://test/${p}`
    },
    storage: {
      local: {
        get: (_key, cb) => cb({}),
        set: (_value, cb) => { if (cb) cb(); }
      }
    }
  };

  global.document = {
    addEventListener: () => {},
    createElement: () => ({
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
      append: () => {},
      appendChild: () => {},
      remove: () => {}
    }),
    getElementById: () => null,
    querySelectorAll: () => [],
    head: null,
    body: null,
    documentElement: null
  };

  global.window = {
    addEventListener: () => {},
    parent: { postMessage: () => {} },
    innerWidth: 1024,
    innerHeight: 768,
    devicePixelRatio: 1,
    scrollY: 0,
    scrollTo: () => {},
    scrollBy: () => {}
  };
}

module.exports = { installBrowserGlobals };
