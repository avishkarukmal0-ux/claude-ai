import { describe, it, expect, beforeEach } from 'vitest';
import { currentActor, actorName, stamp } from '../actor';

const AUTH_KEY = 'vendora:auth';
function setSession(s) { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); }

describe('actor — action attribution from the session', () => {
  beforeEach(() => { localStorage.clear(); });

  it('attributes to Owner when there is no session (guest / accounts off)', () => {
    expect(currentActor()).toEqual({ id: null, name: 'Owner', role: 'owner' });
    expect(actorName()).toBe('Owner');
  });

  it('uses the signed-in member name + role', () => {
    setSession({ token: 't', role: 'staff', member: { id: 'm1', name: 'Priya', role: 'staff' } });
    expect(currentActor()).toEqual({ id: 'm1', name: 'Priya', role: 'staff' });
    expect(actorName()).toBe('Priya');
  });

  it('stamp adds attribution without overwriting existing values', () => {
    setSession({ token: 't', role: 'manager', member: { id: 'm2', name: 'Alex', role: 'manager' } });
    const rec = stamp({ id: 'x' });
    expect(rec).toMatchObject({ id: 'x', actor: 'Alex', actorId: 'm2', actorRole: 'manager' });

    const withField = stamp({}, { field: 'receivedBy' });
    expect(withField.receivedBy).toBe('Alex');

    const preset = stamp({ actor: 'Someone else', receivedBy: 'Bob' }, { field: 'receivedBy' });
    expect(preset.actor).toBe('Someone else'); // not overwritten
    expect(preset.receivedBy).toBe('Bob');
  });
});
