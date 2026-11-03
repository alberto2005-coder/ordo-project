import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/** Where the PIN record is kept. On the phone this is the Keychain / Keystore (expo-secure-store). */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; retryInMs: number }
  | { ok: false; reason: 'no-pin' };

const PIN_KEY = 'ordo.pin';
const TRY_KEY = 'ordo.pin.tries';
export const FREE_TRIES = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 60 * 60_000;

/** A four-digit PIN is ten thousand guesses: new ones need six digits. Records made by older versions still open. */
const ACCEPTED_PIN = /^[0-9]{4,8}$/;
export const isValidPin = (pin: string) => /^[0-9]{6,8}$/.test(pin);

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** How long to refuse attempts after this many wrong ones: none for the first few, then 30 s doubling, capped at an hour. */
export function lockoutFor(fails: number): number {
  if (fails < FREE_TRIES) return 0;
  return Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** (fails - FREE_TRIES));
}

interface Tries {
  fails: number;
  lockedUntil: number;
}

export class PinVault {
  constructor(
    private kv: KeyValue,
    private now: () => number = () => Date.now(),
    /** Slow on purpose, so guessing is slow. Tests pass a small number. */
    private iterations = 300_000,
  ) {}

  private derive(pin: string, salt: Uint8Array, iterations: number) {
    return pbkdf2(sha256, utf8ToBytes(pin), salt, { c: iterations, dkLen: 32 });
  }

  async hasPin(): Promise<boolean> {
    return (await this.kv.get(PIN_KEY)) !== null;
  }

  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error('PIN must be 6 to 8 digits');
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const hash = this.derive(pin, salt, this.iterations);
    await this.kv.set(PIN_KEY, `v1$${this.iterations}$${toHex(salt)}$${toHex(hash)}`);
    await this.kv.delete(TRY_KEY);
  }

  private async tries(): Promise<Tries> {
    try {
      const raw = await this.kv.get(TRY_KEY);
      if (!raw) return { fails: 0, lockedUntil: 0 };
      const t = JSON.parse(raw) as Tries;
      return Number.isFinite(t.fails) && Number.isFinite(t.lockedUntil) ? t : { fails: 0, lockedUntil: 0 };
    } catch {
      return { fails: 0, lockedUntil: 0 };
    }
  }

  async verify(pin: string): Promise<VerifyResult> {
    const record = await this.kv.get(PIN_KEY);
    if (!record) return { ok: false, reason: 'no-pin' };
    const t = await this.tries();
    const now = this.now();
    if (t.lockedUntil > now) return { ok: false, reason: 'locked', retryInMs: t.lockedUntil - now };

    let good = false;
    try {
      const [v, iter, saltHex, hashHex] = record.split('$');
      if (v === 'v1' && ACCEPTED_PIN.test(pin)) {
        const n = parseInt(iter, 10);
        if (Number.isInteger(n) && n > 0 && n <= 1_000_000) good = sameBytes(this.derive(pin, fromHex(saltHex), n), fromHex(hashHex));
      }
    } catch {
      good = false; // a damaged record never unlocks anything
    }

    if (good) {
      await this.kv.delete(TRY_KEY);
      return { ok: true };
    }
    const fails = t.fails + 1;
    const wait = lockoutFor(fails);
    await this.kv.set(TRY_KEY, JSON.stringify({ fails, lockedUntil: wait ? now + wait : 0 } satisfies Tries));
    if (wait) return { ok: false, reason: 'locked', retryInMs: wait };
    return { ok: false, reason: 'wrong', attemptsLeft: FREE_TRIES - fails };
  }

  /** Changing or removing the PIN needs the current one. */
  async changePin(current: string, next: string): Promise<VerifyResult> {
    if (!isValidPin(next)) throw new Error('PIN must be 6 to 8 digits');
    const r = await this.verify(current);
    if (r.ok) await this.setPin(next);
    return r;
  }

  async removePin(current: string): Promise<VerifyResult> {
    const r = await this.verify(current);
    if (r.ok) {
      await this.kv.delete(PIN_KEY);
      await this.kv.delete(TRY_KEY);
    }
    return r;
  }
}
