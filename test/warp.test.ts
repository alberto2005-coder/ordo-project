import { describe, expect, it } from 'vitest';
import type { Pixels } from '../src/image/pixels';
import { FULL_PAGE, isConvex, isFullPage, outputSize, parseCorners, polygonArea, rotate, warpPerspective, type Corners } from '../src/image/warp';

function image(w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}
const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));

describe('corners', () => {
  it('validates stored corners', () => {
    expect(parseCorners(JSON.stringify(FULL_PAGE))).toEqual(FULL_PAGE);
    expect(parseCorners('not json')).toBeNull();
    expect(parseCorners([[0, 0], [1, 0], [1, 1]])).toBeNull();
    expect(parseCorners([[0, 0], [0, 0], [0, 0], [0, 0]])).toBeNull(); // no area
    expect(parseCorners([[0, 0], [1, 1], [1, 0], [0, 1]])).toBeNull(); // twisted
    expect(parseCorners([[0, 0], [1, 0], [1, 1], [NaN, 1]])).toBeNull();
    expect(parseCorners([[0, 0], [1, 0], [2, 1], [0, 1]])).toBeNull();
  });
  it('knows area, convexity and full page', () => {
    expect(polygonArea(FULL_PAGE)).toBeCloseTo(1);
    expect(isConvex(FULL_PAGE)).toBe(true);
    expect(isFullPage(null)).toBe(true);
    expect(isFullPage(FULL_PAGE)).toBe(true);
    expect(isFullPage([[0.1, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });
});

describe('warp', () => {
  it('full frame gives back the same picture', () => {
    const src = image(40, 30, (x, y) => [x * 6, y * 8, 100]);
    const out = warpPerspective(src, FULL_PAGE);
    expect([out.width, out.height]).toEqual([40, 30]);
    for (const [x, y] of [[0, 0], [39, 0], [20, 15], [39, 29]]) {
      const a = at(out, x, y);
      const b = at(src, x, y);
      a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(8));
    }
  });
  it('cuts out a rectangle', () => {
    // red square in the middle of a blue field
    const src = image(100, 100, (x, y) => (x >= 25 && x < 75 && y >= 25 && y < 75 ? [255, 0, 0] : [0, 0, 255]));
    const out = warpPerspective(src, [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]);
    expect([out.width, out.height]).toEqual([50, 50]);
    expect(at(out, 2, 2)).toEqual([255, 0, 0]);
    expect(at(out, 47, 47)).toEqual([255, 0, 0]);
  });
  it('straightens a skewed page: corners land on corners', () => {
    // a trapezoid page in the photo; its four corners have four different colours
    const quad: Corners = [[0.2, 0.1], [0.9, 0.2], [0.8, 0.9], [0.1, 0.8]];
    const src = image(200, 200, (x, y) => {
      const u = x / 200;
      const v = y / 200;
      const near = (c: [number, number]) => Math.hypot(u - c[0], v - c[1]) < 0.06;
      if (near(quad[0])) return [255, 0, 0];
      if (near(quad[1])) return [0, 255, 0];
      if (near(quad[2])) return [0, 0, 255];
      if (near(quad[3])) return [255, 255, 0];
      return [240, 240, 240];
    });
    const out = warpPerspective(src, quad);
    const [w, h] = [out.width, out.height];
    expect(at(out, 3, 3)[0]).toBeGreaterThan(200); // red top-left
    expect(at(out, w - 4, 3)[1]).toBeGreaterThan(200); // green top-right
    expect(at(out, w - 4, h - 4)[2]).toBeGreaterThan(200); // blue bottom-right
    expect(at(out, 3, h - 4)).toEqual([255, 255, 0]); // yellow bottom-left
  });
  it('caps the output size', () => {
    const s = outputSize({ width: 4000, height: 3000 }, FULL_PAGE, 2000);
    expect(Math.max(s.width, s.height)).toBe(2000);
    expect(s.width / s.height).toBeCloseTo(4 / 3, 2);
  });
});

describe('rotate', () => {
  const src = image(3, 2, (x, y) => [x * 10, y * 100, 0]);
  it('turns clockwise', () => {
    const r = rotate(src, 90);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(at(r, 1, 0)).toEqual(at(src, 0, 0)); // top-left goes to top-right
    expect(at(r, 0, 0)).toEqual(at(src, 0, 1)); // bottom-left goes to top-left
  });
  it('four turns come back', () => {
    let r = src;
    for (let i = 0; i < 4; i++) r = rotate(r, 90);
    expect(Array.from(r.data)).toEqual(Array.from(src.data));
    expect(Array.from(rotate(rotate(src, 180), 180).data)).toEqual(Array.from(src.data));
    expect(Array.from(rotate(rotate(src, 270), 90).data)).toEqual(Array.from(src.data));
  });
});
