import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  listStaff, addStaff, updateStaff, removeStaff, __setStaffTransport,
} from '../staffAdmin';

afterEach(() => { __setStaffTransport(null); });

describe('staffAdmin — typed client over /api/pwa-auth/staff', () => {
  it('listStaff returns the members array', async () => {
    __setStaffTransport(async (path, opts) => {
      expect(path).toBe('');
      expect(opts.method).toBe('GET');
      return { members: [{ id: 'a', name: 'A', role: 'staff' }] };
    });
    expect(await listStaff()).toEqual([{ id: 'a', name: 'A', role: 'staff' }]);
  });

  it('addStaff posts the new member and returns it', async () => {
    const calls = [];
    __setStaffTransport(async (path, opts) => { calls.push({ path, opts }); return { member: { id: 'n', ...opts.body } }; });
    const m = await addStaff({ email: 'x@y.z', name: 'Sam', role: 'staff', password: 'password1' });
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.body).toMatchObject({ email: 'x@y.z', name: 'Sam', role: 'staff' });
    expect(m).toMatchObject({ id: 'n', name: 'Sam' });
  });

  it('updateStaff patches by id', async () => {
    __setStaffTransport(async (path, opts) => {
      expect(path).toBe('/m1');
      expect(opts.method).toBe('PATCH');
      expect(opts.body).toEqual({ role: 'manager' });
      return { member: { id: 'm1', role: 'manager' } };
    });
    expect(await updateStaff('m1', { role: 'manager' })).toMatchObject({ role: 'manager' });
  });

  it('removeStaff deletes by id', async () => {
    __setStaffTransport(async (path, opts) => { expect(path).toBe('/m1'); expect(opts.method).toBe('DELETE'); return { removed: true }; });
    expect(await removeStaff('m1')).toEqual({ removed: true });
  });

  it('surfaces a failed request with its status', async () => {
    __setStaffTransport(async () => { const e = new Error('nope'); e.status = 403; throw e; });
    await expect(listStaff()).rejects.toMatchObject({ status: 403 });
  });
});
