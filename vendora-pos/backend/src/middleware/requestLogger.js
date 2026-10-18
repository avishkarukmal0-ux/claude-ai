const logger = require('../utils/logger');

// Per-request logging: 5xx → error, 4xx → warn, 2xx/3xx → debug (so a healthy 200 — incl. the uptime ping —
// does NOT spam the production info log). To keep normal traffic VISIBLE without logging every success, we
// also aggregate all requests and emit ONE info line every METRICS_WINDOW_MS with the count + p95 + error
// tally + process RSS, so you can see load and memory headroom on the 512MB instance at a glance.
const METRICS_WINDOW_MS = (parseInt(process.env.METRICS_WINDOW_MINUTES, 10) || 5) * 60 * 1000;
const MAX_SAMPLES = 50000; // cap the per-window duration buffer so a flood can't grow memory unbounded

let durations = [];
let total = 0;      // requests this window (may exceed durations.length if capped)
let clientErrs = 0; // 4xx
let serverErrs = 0; // 5xx

function record(ms, status) {
  total += 1;
  if (status >= 500) serverErrs += 1;
  else if (status >= 400) clientErrs += 1;
  if (durations.length < MAX_SAMPLES) durations.push(ms);
}

function p95(sorted) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

function flushMetrics() {
  if (!total) return; // nothing happened this window — stay quiet
  const sorted = durations.slice().sort((a, b) => a - b);
  const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
  logger.info(
    `traffic: ${total} req / ${Math.round(METRICS_WINDOW_MS / 60000)}m · p95=${p95(sorted)}ms · 4xx=${clientErrs} 5xx=${serverErrs} · rss=${rssMb}MB`,
  );
  durations = [];
  total = 0;
  clientErrs = 0;
  serverErrs = 0;
}

// One timer for the process. unref() so it never keeps Node alive on its own (clean shutdown/tests), and skip
// under the test runner so suites don't leave an open handle.
if (process.env.NODE_ENV !== 'test') {
  const t = setInterval(flushMetrics, METRICS_WINDOW_MS);
  if (typeof t.unref === 'function') t.unref();
}

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    record(duration, res.statusCode);
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 500) {
      logger.error(msg);
    } else if (res.statusCode >= 400) {
      logger.warn(msg);
    } else {
      logger.debug(msg);
    }
  });

  next();
};

module.exports = requestLogger;
// Exposed for tests.
module.exports.__flushMetrics = flushMetrics;
