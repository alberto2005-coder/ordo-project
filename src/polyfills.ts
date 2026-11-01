import * as Crypto from 'expo-crypto';

const g = globalThis as {
  crypto?: { getRandomValues?: unknown };
  Buffer?: unknown;
  btoa?: unknown;
  atob?: unknown;
};

/** PDF encryption needs secure random numbers. Hermes may not provide crypto.getRandomValues,
 *  so fall back to the phone's own secure generator. Import this file first in the app. */
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues: Crypto.getRandomValues };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of a "binary string" (one char per byte), the same input the browser's btoa takes. */
function toBase64(binary: string): string {
  let out = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i) & 0xff;
    const hasB = i + 1 < binary.length;
    const hasC = i + 2 < binary.length;
    const b = hasB ? binary.charCodeAt(i + 1) & 0xff : 0;
    const c = hasC ? binary.charCodeAt(i + 2) & 0xff : 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += hasB ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
    out += hasC ? ALPHABET[c & 63] : '=';
  }
  return out;
}

/** The inverse of toBase64: padding, spaces and newlines are ignored. */
function fromBase64(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const a = ALPHABET.indexOf(clean[i]);
    const b = i + 1 < clean.length ? ALPHABET.indexOf(clean[i + 1]) : 0;
    const c = i + 2 < clean.length ? ALPHABET.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? ALPHABET.indexOf(clean[i + 3]) : -1;
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

/** React Native has no btoa/atob. The bundled text font is decoded with atob, and jpeg-js falls back
 *  to btoa when the platform has no base64 encoder. */
if (typeof g.btoa !== 'function') g.btoa = toBase64;
if (typeof g.atob !== 'function') g.atob = fromBase64;

/** jpeg-js is written for Node: when it finishes encoding it calls Buffer.from(bytes) and, for decoding,
 *  Buffer.alloc(size). Node's Buffer does not exist in React Native, and without it making a JPEG throws
 *  "Property 'Buffer' doesn't exist". A plain Uint8Array is all either call needs. */
if (typeof g.Buffer !== 'function') {
  g.Buffer = {
    from: (source: ArrayLike<number>) => Uint8Array.from(source),
    alloc: (size: number) => new Uint8Array(size),
    isBuffer: () => false,
  };
}
