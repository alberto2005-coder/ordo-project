import * as Crypto from 'expo-crypto';

/** PDF encryption needs secure random numbers. Hermes may not provide crypto.getRandomValues,
 *  so fall back to the phone's own secure generator. Import this file first in the app. */
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...(g.crypto ?? {}), getRandomValues: Crypto.getRandomValues };
}
