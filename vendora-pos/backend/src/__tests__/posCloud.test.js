'use strict';

// posCloudService — the slice 4 cloud scaffolding must be INERT and HONEST by default: disabled, never fakes a
// connection, never stores a token in the clear, and captures events exactly once. These are unit tests with
// no database — the DB-backed enqueue is exercised against a mocked model.

describe('posCloudService — inert & honest by default', () => {
  let posCloud;
  beforeEach(() => {
    jest.resetModules();
    delete process.env.POS_CLOUD_ENABLED;
    delete process.env.POS_TOKEN_KEY;
    delete process.env.POS_SQUARE_CLIENT_ID;
    delete process.env.POS_SQUARE_CLIENT_SECRET;
    posCloud = require('../services/posCloudService');
  });

  test('cloud is OFF by default', () => {
    expect(posCloud.cloudEnabled()).toBe(false);
  });

  test('no provider is "configured" without flag + key + credentials', () => {
    expect(posCloud.providerConfigured('square')).toBe(false);
    expect(posCloud.providerConfigured('sumup')).toBe(false);
  });

  test('unavailableReason is honest and non-empty', () => {
    expect(posCloud.unavailableReason('square')).toMatch(/not switched on/i);
    expect(posCloud.unavailableReason('nope')).toMatch(/unknown/i);
  });

  test('startConnect throws an honest 503 (never a fabricated authorize URL)', async () => {
    await expect(posCloud.startConnect('acc1', 'square')).rejects.toMatchObject({
      statusCode: 503, errorCode: 'POS_NOT_AVAILABLE',
    });
  });

  test('startConnect 404s for an unknown provider', async () => {
    await expect(posCloud.startConnect('acc1', 'definitely-not-real')).rejects.toMatchObject({ statusCode: 404 });
  });

  test('handleCallback refuses honestly', async () => {
    await expect(posCloud.handleCallback('acc1', 'square', {})).rejects.toMatchObject({ statusCode: 503 });
  });

  test('receiveWebhook is inert (not_configured) when nothing is set up', async () => {
    const r = await posCloud.receiveWebhook('square', { rawBody: Buffer.from('{}'), headers: {} });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('not_configured');
  });
});

describe('posCloudService — even fully "configured", it delegates to the adapter (no fakes)', () => {
  let posCloud;
  beforeEach(() => {
    jest.resetModules();
    process.env.POS_CLOUD_ENABLED = 'true';
    process.env.POS_TOKEN_KEY = 'a'.repeat(64);
    process.env.POS_SQUARE_CLIENT_ID = 'test-id';
    process.env.POS_SQUARE_CLIENT_SECRET = 'test-secret';
    posCloud = require('../services/posCloudService');
  });
  afterEach(() => {
    delete process.env.POS_CLOUD_ENABLED;
    delete process.env.POS_TOKEN_KEY;
    delete process.env.POS_SQUARE_CLIENT_ID;
    delete process.env.POS_SQUARE_CLIENT_SECRET;
  });

  test('a ready provider now counts as configured', () => {
    expect(posCloud.cloudEnabled()).toBe(true);
    expect(posCloud.providerConfigured('square')).toBe(true); // square = ready_for_testing
  });

  test('startConnect reaches the adapter, which throws "not available" — we never fabricate success', async () => {
    // The adapter's connect() throws ProviderNotAvailableError (501) until implemented + sandbox-verified.
    await expect(posCloud.startConnect('acc1', 'square')).rejects.toMatchObject({ code: 'PROVIDER_NOT_AVAILABLE' });
  });

  test('an approval-required provider is still NOT configured (adapter.canConnect() is false)', () => {
    expect(posCloud.providerConfigured('lightspeed')).toBe(false); // approval_required
  });
});

describe('posCloudService — durable queue is idempotent', () => {
  let posCloud;
  let PosSaleEvent;
  beforeEach(() => {
    jest.resetModules();
    PosSaleEvent = require('../models/PosSaleEvent').PosSaleEvent;
    posCloud = require('../services/posCloudService');
  });
  afterEach(() => jest.restoreAllMocks());

  test('enqueueEvent stores a pending event', async () => {
    const spy = jest.spyOn(PosSaleEvent, 'create').mockResolvedValue({});
    const r = await posCloud.enqueueEvent('acc1', 'square', { dedupeKey: 'square:m1:s1', payload: { ok: true } });
    expect(r).toEqual({ enqueued: true, duplicate: false });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ account: 'acc1', provider: 'square', dedupeKey: 'square:m1:s1', status: 'pending' }));
  });

  test('a duplicate (unique-index 11000) is a no-op, not an error', async () => {
    jest.spyOn(PosSaleEvent, 'create').mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const r = await posCloud.enqueueEvent('acc1', 'square', { dedupeKey: 'square:m1:s1' });
    expect(r).toEqual({ enqueued: false, duplicate: true });
  });

  test('enqueue requires a dedupe key', async () => {
    await expect(posCloud.enqueueEvent('acc1', 'square', { dedupeKey: '' })).rejects.toMatchObject({ errorCode: 'POS_NO_DEDUPE_KEY' });
  });
});
