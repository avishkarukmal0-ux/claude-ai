import { describe, it, expect, afterEach } from 'vitest';
import {
  getProviders, getConnections, startConnect, describeConnection, __setPosTransport,
} from '../posClient';

afterEach(() => { __setPosTransport(null); });

describe('posClient.getProviders — honest, degrade-not-fake', () => {
  it('passes the catalogue through with ok:true on success', async () => {
    __setPosTransport(async () => ({
      success: true, docsCheckedAt: '2026-10-21', liveMethods: ['csv'],
      providers: [{ id: 'square', name: 'Square', availability: 'ready_for_testing', csvCapable: true }],
      testable: ['square'], csvCapable: ['square'],
    }));
    const res = await getProviders();
    expect(res.ok).toBe(true);
    expect(res.liveMethods).toEqual(['csv']);
    expect(res.providers[0].id).toBe('square');
  });

  it('returns ok:false (never a fake success) when the request throws', async () => {
    __setPosTransport(async () => { throw new Error('boom'); });
    const res = await getProviders();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    expect(res.providers).toBeUndefined();
  });

  it('flags a 401 as needsLogin so the screen can prompt sign-in, not blank', async () => {
    __setPosTransport(async () => { const e = new Error('Unauthorized'); e.status = 401; throw e; });
    const res = await getProviders();
    expect(res.ok).toBe(false);
    expect(res.needsLogin).toBe(true);
  });
});

describe('posClient.getConnections — never fabricates a connection', () => {
  it('passes through real connections + cloudEnabled', async () => {
    __setPosTransport(async () => ({ success: true, cloudEnabled: false, connections: [] }));
    const res = await getConnections();
    expect(res.ok).toBe(true);
    expect(res.cloudEnabled).toBe(false);
    expect(res.connections).toEqual([]);
  });

  it('degrades to ok:false with empty connections on failure (no fake connected state)', async () => {
    __setPosTransport(async () => { const e = new Error('nope'); e.status = 500; throw e; });
    const res = await getConnections();
    expect(res.ok).toBe(false);
    expect(res.cloudEnabled).toBe(false);
    expect(res.connections).toEqual([]);
  });
});

describe('posClient.startConnect — surfaces the honest server answer', () => {
  it('marks a 503 as notAvailable and keeps the message', async () => {
    __setPosTransport(async () => { const e = new Error('Direct till connections are not switched on yet'); e.status = 503; throw e; });
    const res = await startConnect('square');
    expect(res.ok).toBe(false);
    expect(res.notAvailable).toBe(true);
    expect(res.error).toMatch(/not switched on/i);
  });
});

describe('posClient.describeConnection — pure status mapping', () => {
  it('maps known statuses and defaults safely', () => {
    expect(describeConnection('connected')).toEqual({ label: 'Connected', tone: 'green' });
    expect(describeConnection('needs_attention').tone).toBe('amber');
    expect(describeConnection('paused').label).toBe('Paused');
    expect(describeConnection(undefined)).toEqual({ label: 'Not connected', tone: 'gray' });
  });
});
