import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
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
  it('accepts only 6 to 8 digits (new PINs)', () => {
    for (const ok of ['123456', '00000000', '482103']) expect(isValidPin(ok)).toBe(true);
    for (const bad of ['1234', '12345', '123', '123456789', 'abcd', '12 34', '', '12.4', '١٢٣٤']) expect(isValidPin(bad)).toBe(false);
  });

  it('sets a PIN, verifies it, and never stores it in readable form', async () => {
    const { kv, vault } = make();
    expect(await vault.hasPin()).toBe(false);
    expect(await vault.verify('123456')).toEqual({ ok: false, reason: 'no-pin' });
    await vault.setPin('482103');
    expect(await vault.hasPin()).toBe(true);
    expect(await vault.verify('482103')).toEqual({ ok: true });
    expect([...kv.data.values()].join('|')).not.toContain('482103');
  });

  it('the same PIN stored twice gives different records (random salt)', async () => {
    const a = make();
    const b = make();
    await a.vault.setPin('482103');
    await b.vault.setPin('482103');
    expect(a.kv.data.get('ordo.pin')).not.toBe(b.kv.data.get('ordo.pin'));
  });

  it('rejects a wrong PIN and counts down the free tries', async () => {
    const { vault } = make();
    await vault.setPin('482103');
    expect(await vault.verify('000000')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 1 });
    expect(await vault.verify('111111')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 2 });
    expect(await vault.verify('482103')).toEqual({ ok: true }); // success resets
    expect(await vault.verify('000000')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - 1 });
  });

  it('locks after too many wrong PINs, even the right PIN is refused during the wait, then it opens again', async () => {
    const { vault, t } = make();
    await vault.setPin('482103');
    let last;
    for (let i = 0; i < FREE_TRIES; i++) last = await vault.verify('000000');
    expect(last).toMatchObject({ ok: false, reason: 'locked' });
    expect(await vault.verify('482103')).toMatchObject({ ok: false, reason: 'locked' });
    t.now += 29_000;
    expect(await vault.verify('482103')).toMatchObject({ ok: false, reason: 'locked' });
    t.now += 2_000;
    expect(await vault.verify('482103')).toEqual({ ok: true });
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
    await v1.setPin('482103');
    for (let i = 0; i < FREE_TRIES; i++) await v1.verify('000000');
    const v2 = new PinVault(kv, () => t.now, 1000); // a fresh object, as after the app is closed
    expect(await v2.verify('482103')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('changing or removing the PIN needs the current one', async () => {
    const { vault } = make();
    await vault.setPin('482103');
    expect(await vault.changePin('000000', '999999')).toMatchObject({ ok: false });
    expect(await vault.verify('482103')).toEqual({ ok: true });
    expect(await vault.changePin('482103', '999999')).toEqual({ ok: true });
    expect(await vault.verify('999999')).toEqual({ ok: true });
    expect(await vault.verify('482103')).toMatchObject({ ok: false });
    expect(await vault.removePin('111111')).toMatchObject({ ok: false });
    expect(await vault.hasPin()).toBe(true);
    expect(await vault.removePin('999999')).toEqual({ ok: true });
    expect(await vault.hasPin()).toBe(false);
    await expect(vault.setPin('12345')).rejects.toThrow();
    await expect(vault.changePin('999999', 'abcd')).rejects.toThrow();
  });

  it('still opens a four-digit record written by an older version', async () => {
    const kv = memory();
    const salt = new Uint8Array(16).fill(9);
    const hash = pbkdf2(sha256, utf8ToBytes('1234'), salt, { c: 1000, dkLen: 32 });
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    kv.data.set('ordo.pin', `v1$1000$${hex(salt)}$${hex(hash)}`);
    const vault = new PinVault(kv, () => 1_000_000, 1000);
    expect(await vault.verify('1234')).toEqual({ ok: true });
    // But a new PIN cannot be that short.
    await expect(vault.changePin('1234', '1234')).rejects.toThrow();
  });

  it('a damaged or tampered record never unlocks', async () => {
    const { kv, vault } = make();
    for (const bad of ['garbage', 'v1$abc$zz$yy', 'v1$1000$$', 'v2$1000$00$00', 'v1$99999999$00$00', '']) {
      kv.data.set('ordo.pin', bad);
      const r = await vault.verify('482103');
      expect(r.ok).toBe(false);
    }
    kv.data.set('ordo.pin.tries', '{not json');
    await vault.setPin('482103'); // clears the damaged counter
    expect(await vault.verify('482103')).toEqual({ ok: true });
  });

  it('non-numeric input is a wrong PIN, not a crash', async () => {
    const { vault } = make();
    await vault.setPin('482103');
    expect(await vault.verify('abcd')).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await vault.verify('')).toMatchObject({ ok: false });
  });
});
