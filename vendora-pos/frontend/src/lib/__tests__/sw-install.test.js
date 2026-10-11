import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Audit F10 (round 2): the service-worker install must FAIL if a REQUIRED entry chunk can't be cached, rather
// than becoming ready with an incomplete shell that blanks on the first offline load. We load public/sw.js in a
// scoped sandbox (injected self/caches/fetch) and drive its install handler, as the auditor did.
const SW_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/sw.js');
const CODE = fs.readFileSync(SW_PATH, 'utf8');

function loadSW(fetchImpl) {
  const handlers = {};
  const store = new Map();
  const cache = {
    put: async (k, v) => { store.set(typeof k === 'string' ? k : k.url, v); },
    match: async (k) => store.get(k),
    add: async () => {},
    addAll: async () => {},
    keys: async () => [],
  };
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', CODE)(self, caches, fetchImpl);
  return { handlers, store };
}

const htmlRes = (html) => ({ ok: true, status: 200, clone() { return this; }, text: async () => html });
const okRes = () => ({ ok: true, status: 200, clone() { return this; } });
const failRes = (status = 503) => ({ ok: false, status });

const ENTRY_HTML = '<script type="module" src="/assets/index-abc.js"></script>'
  + '<link rel="modulepreload" href="/assets/vendor-react-xyz.js">'
  + '<link rel="stylesheet" href="/assets/index-abc.css">'
  + '<link rel="preload" href="/assets/font-1.woff2" as="font">';

describe('service worker install (audit F10 r2)', () => {
  it('FAILS the install when a REQUIRED entry chunk cannot be cached', async () => {
    const fetchImpl = async (url) => {
      if (url === '/index.html') return htmlRes(ENTRY_HTML);
      if (String(url).includes('vendor-react')) return failRes(503); // a required chunk is unavailable
      return okRes();
    };
    const { handlers } = loadSW(fetchImpl);
    let waited;
    handlers.install({ waitUntil: (p) => { waited = p; } });
    await expect(waited).rejects.toBeTruthy(); // must NOT install with an incomplete shell
  });

  it('SUCCEEDS when all required entry assets cache, even if an optional font is missing', async () => {
    const fetchImpl = async (url) => {
      if (url === '/index.html') return htmlRes(ENTRY_HTML);
      if (String(url).endsWith('.woff2')) return failRes(404); // optional font missing — must NOT block install
      return okRes();
    };
    const { handlers, store } = loadSW(fetchImpl);
    let waited;
    handlers.install({ waitUntil: (p) => { waited = p; } });
    await expect(waited).resolves.toBeUndefined();
    expect(store.has('/assets/index-abc.js')).toBe(true);      // required entry cached
    expect(store.has('/assets/vendor-react-xyz.js')).toBe(true);
    expect(store.has('/assets/index-abc.css')).toBe(true);
  });

  it('FAILS the install when index.html itself is unavailable', async () => {
    const { handlers } = loadSW(async () => failRes(502));
    let waited;
    handlers.install({ waitUntil: (p) => { waited = p; } });
    await expect(waited).rejects.toBeTruthy();
  });
});
