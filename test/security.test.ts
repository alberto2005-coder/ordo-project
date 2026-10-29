import { describe, expect, it } from 'vitest';
import { FREE_TRIES, isValidPin, lockoutFor, PinVault, type KeyValue } from '../src/security/pin';

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}
const make = (t = { now: 1_000_000 }) => {
  const kv = memory();
  const vault = new PinVault(kv, () => t.now, 1000);
  return { kv, vault, t };
};

describe('PIN', () => {
  it('accepts only 4 to 8 digits', () => {
    for (const ok of ['1234', '00000000', '123456']) expect(isValidPin(ok)).toBe(true);
    for (const bad of ['123', '123456789', 'abcd', '12 34', '', '12.4', '١٢٣٤']) expect(isValidPin(bad)).toBe(false);
  });

  it('sets a PIN, verifies it, and never stores it in readable form', async () => {
    const { kv, vault } = make();
    expect(await vault.hasPin()).toBe(false);
    expect(await vault.verify('1234')).toEqual({ ok: false, reason: 'no-pin' });
    await vault.setPin('4821');
    expect(await vault.hasPin()).toBe(true);
    expect(await vault.verify('4821')).toEqual({ ok: true });
    expect([...kv.data.values()].join('|')).not.toContain('4821');
  });

  it('the same PIN stored twice gives different records (random salt)', async () => {
    const a = make();
    const b = make();
    await a.vault.setPin('4821');
    await b.vault.setPin('4821');
    expect(a.kv.data.get('ordo.pin')).not.toBe(b.kv.data.get('ordo.pin'));
  });

  it('rejects a wrong PIN and counts down the free tries', async () => {
    const { vault } = make();
    await vault.setPin('4821');
    expect(await vault.verify('0000')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 1 });
    expect(await vault.verify('1111')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 2 });
    expect(await vault.verify('4821')).toEqual({ ok: true }); // success resets
    expect(await vault.verify('0000')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 1 });
  });

  it('locks after too many wrong PINs, even the right PIN is refused during the wait, then it opens again', async () => {
    const { vault, t } = make();
    await vault.setPin('4821');
    let last;
    for (let i = 0; i < FREE_TRIES; i++) last = await vault.verify('0000');
    expect(last).toMatchObject({ ok: false, reason: 'locked' });
    expect(await vault.verify('4821')).toMatchObject({ ok: false, reason: 'locked' });
    t.now += 29_000;
    expect(await vault.verify('4821')).toMatchObject({ ok: false, reason: 'locked' });
    t.now += 2_000;
    expect(await vault.verify('4821')).toEqual({ ok: true });
  });

  it('waits longer each time and caps at one hour', () => {
    expect(lockoutFor(1)).toBe(0);
    expect(lockoutFor(FREE_TRIES - 1)).toBe(0);
    expect(lockoutFor(FREE_TRIES)).toBe(30_000);
    expect(lockoutFor(FREE_TRIES + 1)).toBe(60_000);
    expect(lockoutFor(FREE_TRIES + 2)).toBe(120_000);
    expect(lockoutFor(100)).toBe(3_600_000);
  });

  it('survives a restart: the lock is kept in storage, not in memory', async () => {
    const kv = memory();
    const t = { now: 5_000_000 };
    const v1 = new PinVault(kv, () => t.now, 1000);
    await v1.setPin('4821');
    for (let i = 0; i < FREE_TRIES; i++) await v1.verify('0000');
    const v2 = new PinVault(kv, () => t.now, 1000); // a fresh object, as after the app is closed
    expect(await v2.verify('4821')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('changing or removing the PIN needs the current one', async () => {
    const { vault } = make();
    await vault.setPin('4821');
    expect(await vault.changePin('0000', '9999')).toMatchObject({ ok: false });
    expect(await vault.verify('4821')).toEqual({ ok: true });
    expect(await vault.changePin('4821', '9999')).toEqual({ ok: true });
    expect(await vault.verify('9999')).toEqual({ ok: true });
    expect(await vault.verify('4821')).toMatchObject({ ok: false });
    expect(await vault.removePin('1111')).toMatchObject({ ok: false });
    expect(await vault.hasPin()).toBe(true);
    expect(await vault.removePin('9999')).toEqual({ ok: true });
    expect(await vault.hasPin()).toBe(false);
    await expect(vault.setPin('12')).rejects.toThrow();
    await expect(vault.changePin('9999', 'abcd')).rejects.toThrow();
  });

  it('a damaged or tampered record never unlocks', async () => {
    const { kv, vault } = make();
    for (const bad of ['garbage', 'v1$abc$zz$yy', 'v1$1000$$', 'v2$1000$00$00', 'v1$99999999$00$00', '']) {
      kv.data.set('ordo.pin', bad);
      const r = await vault.verify('4821');
      expect(r.ok).toBe(false);
    }
    kv.data.set('ordo.pin.tries', '{not json');
    await vault.setPin('4821'); // clears the damaged counter
    expect(await vault.verify('4821')).toEqual({ ok: true });
  });

  it('non-numeric input is a wrong PIN, not a crash', async () => {
    const { vault } = make();
    await vault.setPin('4821');
    expect(await vault.verify('abcd')).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await vault.verify('')).toMatchObject({ ok: false });
  });
});
