/**
 * jpeg-js is written for Node and uses Node's Buffer on two paths:
 *
 *   encoder.js  return Buffer.from(byteout);      // every JPEG it makes
 *   decoder.js  Buffer.alloc(bytesNeeded)         // only when useTArray is off
 *
 * React Native has no Buffer, so encoding throws
 * "Property 'Buffer' doesn't exist". The encoder only needs the bytes, and a
 * Uint8Array is exactly that, so we teach the library to fall back to it.
 *
 * Runs on postinstall, is idempotent, and never fails the install.
 */
const fs = require('node:fs');
const path = require('node:path');

const lib = path.join(__dirname, '..', 'node_modules', 'jpeg-js', 'lib');

function patch(file, from, to) {
  const full = path.join(lib, file);
  let text;
  try {
    text = fs.readFileSync(full, 'utf8');
  } catch {
    return; // jpeg-js is not installed (nothing to do)
  }
  if (text.includes(to)) return; // already patched
  if (!text.includes(from)) {
    console.warn(`[patch-jpeg-js] ${file}: expected code not found, skipping`);
    return;
  }
  fs.writeFileSync(full, text.replace(from, to));
  console.log(`[patch-jpeg-js] patched ${file}`);
}

patch(
  'encoder.js',
  'return Buffer.from(byteout);',
  'return Buffer.from(byteout);'
);

// Encoder: make the Buffer call optional.
patch(
  'encoder.js',
  "      return Buffer.from(byteout);",
  "      if (typeof Buffer === 'undefined') return new Uint8Array(byteout);\n      return Buffer.from(byteout);"
);

// Encoder: the base64 fallback is dead code after the return above, but it is
// created at load time, so guard it too.
patch(
  'encoder.js',
  'var btoa = btoa || function(buf) {\n  return Buffer.from(buf).toString(\'base64\');\n};',
  "var btoa = btoa || function(buf) {\n  if (typeof Buffer === 'undefined') return '';\n  return Buffer.from(buf).toString('base64');\n};"
);

// Decoder: same idea for the non-typed-array path (we always pass useTArray,
// but a caller that forgets should still get an image instead of a crash).
patch(
  'decoder.js',
  '        Buffer.alloc(bytesNeeded)',
  "        (typeof Buffer !== 'undefined' ? Buffer.alloc(bytesNeeded) : new Uint8Array(bytesNeeded))"
);
