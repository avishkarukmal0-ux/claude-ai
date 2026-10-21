/* Boot watchdog — turns a BLANK screen into a visible, actionable error (and a self-heal button).
 *
 * Loaded as a classic 'self' script BEFORE the app module (CSP-safe: no inline code), so its error handlers
 * are armed before the bundle runs. If the React app fails to mount (bad chunk, runtime throw, stuck cache),
 * the user would otherwise see nothing; this renders the captured error + two buttons into #root instead.
 * When the app mounts normally, this never shows anything. Deliberately ES5 + dependency-free so it still
 * runs on a quirky device where the main bundle didn't. */
(function () {
  if (window.__vendoraBoot) return;
  window.__vendoraBoot = true;
  var firstError = null;
  function cap(kind, msg, stack) {
    if (!firstError) firstError = { kind: kind, msg: String(msg == null ? '' : msg), stack: String(stack || '') };
  }
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target.tagName && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK')) {
      cap('resource', 'Failed to load ' + (e.target.src || e.target.href || 'an asset'), '');
    } else {
      cap('error', e && e.message, e && e.error && e.error.stack);
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    cap('promise', (r && r.message) || r, r && r.stack);
  });

  function booted() {
    var r = document.getElementById('root');
    return !!(r && r.children && r.children.length > 0);
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; });
  }
  function reset() {
    var done = function () { try { location.reload(); } catch (e) { /* noop */ } };
    try {
      var tasks = [];
      if ('serviceWorker' in navigator) {
        tasks.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        })['catch'](function () {}));
      }
      if (window.caches && caches.keys) {
        tasks.push(caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches['delete'](k); }));
        })['catch'](function () {}));
      }
      Promise.all(tasks).then(done, done);
      setTimeout(done, 2500); // belt-and-braces if a promise hangs
    } catch (e) { done(); }
  }
  function showPanel() {
    if (booted()) return;
    var root = document.getElementById('root');
    if (!root) return;
    var err = firstError;
    var detail = err
      ? '<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;max-height:40vh;overflow:auto;margin:0">'
        + esc(err.kind + ': ' + err.msg + (err.stack ? '\n' + err.stack : '')) + '</pre>'
      : '<p style="color:#6b7280;margin:0">The app didn’t finish loading. This is usually a cached or interrupted update.</p>';
    root.innerHTML = '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:40px auto;padding:20px;line-height:1.4">'
      + '<h1 style="font-size:18px;margin:0 0 10px">Vendora couldn’t start</h1>'
      + detail
      + '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'
      + '<button id="vb-reload" style="min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #d1d5db;background:#fff;font-weight:600">Reload</button>'
      + '<button id="vb-reset" style="min-height:44px;padding:0 16px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-weight:600">Clear app data &amp; reload</button>'
      + '</div>'
      + '<p style="color:#9ca3af;font-size:12px;margin-top:12px">Clearing removes only this device’s cached copy — your synced shop data is safe in the cloud.</p>'
      + '</div>';
    var rl = document.getElementById('vb-reload');
    var rs = document.getElementById('vb-reset');
    if (rl) rl.onclick = function () { location.reload(); };
    if (rs) rs.onclick = function () { reset(); };
  }

  // If a hard error fires, show shortly after (gives the app a moment in case it recovers).
  window.addEventListener('error', function () { setTimeout(function () { if (!booted()) showPanel(); }, 1500); }, true);
  window.addEventListener('unhandledrejection', function () { setTimeout(function () { if (!booted()) showPanel(); }, 2500); });
  // Watchdog: if nothing has mounted after 10s, surface the diagnostic rather than a blank screen.
  var watchdog = setTimeout(showPanel, 10000);
  var poll = setInterval(function () { if (booted()) { clearTimeout(watchdog); clearInterval(poll); } }, 500);
  setTimeout(function () { clearInterval(poll); }, 16000);
})();
