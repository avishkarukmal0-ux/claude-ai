'use strict';

// The periodic traffic-metrics line (count + p95 + rss) emitted by requestLogger. Logger is mocked so we can
// assert the aggregated info line without a real transport. NODE_ENV=test disables the module's own interval,
// so we drive the flush manually.
const EventEmitter = require('events');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
const logger = require('../utils/logger');
const requestLogger = require('../middleware/requestLogger');

function hit(status) {
  const req = { method: 'GET', originalUrl: '/x' };
  const res = new EventEmitter();
  res.statusCode = status;
  requestLogger(req, res, () => {});
  res.emit('finish'); // triggers the per-request record + line
}

describe('requestLogger — periodic traffic metrics', () => {
  beforeEach(() => jest.clearAllMocks());

  test('aggregates a window into one info line with count, p95, error tallies and rss', () => {
    for (let i = 0; i < 10; i += 1) hit(200);
    hit(404);
    hit(500);
    requestLogger.__flushMetrics();

    const line = logger.info.mock.calls.map((c) => c[0]).find((m) => typeof m === 'string' && m.startsWith('traffic:'));
    expect(line).toBeTruthy();
    expect(line).toContain('12 req');   // 10 + 1 + 1
    expect(line).toContain('4xx=1');
    expect(line).toContain('5xx=1');
    expect(line).toMatch(/p95=\d+ms/);
    expect(line).toMatch(/rss=\d+MB/);
  });

  test('stays quiet when no requests happened in the window', () => {
    requestLogger.__flushMetrics();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
