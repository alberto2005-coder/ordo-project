import { describe, expect, it } from 'vitest';
import { findGutter, splitSpread } from '../src/image/book';
import type { Pixels } from '../src/image/pixels';

function spread(w: number, h: number, foldAt: number, shadow: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - foldAt);
      let v = 225 - shadow * Math.max(0, 1 - d / (w * 0.04));
      if (y % 30 > 10 && y % 30 < 16 && x % 120 > 15) v -= 120; // text
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

describe('book mode', () => {
  it('finds the fold where the shadow is, even off-centre', () => {
    expect(Math.abs(findGutter(spread(800, 500, 400, 90)) - 400)).toBeLessThanOrEqual(6);
    expect(Math.abs(findGutter(spread(800, 500, 360, 90)) - 360)).toBeLessThanOrEqual(6);
    expect(Math.abs(findGutter(spread(800, 500, 440, 70)) - 440)).toBeLessThanOrEqual(6);
  });
  it('cuts in the middle when there is no shadow', () => {
    expect(findGutter(spread(800, 500, 400, 0))).toBe(400);
  });
  it('splits into two pictures that add up to the whole', () => {
    const img = spread(801, 500, 400, 90);
    const [l, r] = splitSpread(img);
    expect(l.width + r.width).toBe(801);
    expect(l.height).toBe(500);
    expect(r.height).toBe(500);
    // first pixel of the right page is the pixel at the cut in the original
    const cut = l.width;
    expect(Array.from(r.data.slice(0, 4))).toEqual(Array.from(img.data.slice(cut * 4, cut * 4 + 4)));
    expect(Array.from(l.data.slice(0, 4))).toEqual(Array.from(img.data.slice(0, 4)));
  });
  it('never makes an empty page', () => {
    const [l, r] = splitSpread(spread(10, 10, 5, 0));
    expect(l.width).toBeGreaterThan(0);
    expect(r.width).toBeGreaterThan(0);
  });
});
