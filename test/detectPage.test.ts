import { describe, expect, it } from 'vitest';
import { detectPage } from '../src/image/detectPage';
import type { Pixels } from '../src/image/pixels';
import type { Corners } from '../src/image/warp';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function inside(quad: Corners, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = quad[i];
    const [bx, by] = quad[(i + 1) % 4];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const s = Math.sign(c);
    if (s && sign && s !== sign) return false;
    if (s) sign = s;
  }
  return true;
}

/** A photo of a page on a desk: textured background, lighting that fades across the picture, noise, ink lines on the page. */
function photo(quad: Corners, opts: { page?: number; bg?: number; w?: number; h?: number; seed?: number; noise?: number; text?: boolean } = {}): Pixels {
  const { page = 232, bg = 95, w = 400, h = 520, seed = 3, noise = 10, text = true } = opts;
  const r = rng(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const light = 1 - 0.25 * (x / w) - 0.1 * (y / h);
      const onPage = inside(quad, x / w, y / h);
      let v = onPage ? page : bg + 12 * Math.sin(x / 9) * Math.cos(y / 13);
      if (onPage && text && y % 26 > 9 && y % 26 < 15 && x % 97 > 6) v = 70;
      v = v * light + (r() - 0.5) * noise * 2;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v * 0.97;
      data[i + 2] = v * 0.92;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const near = (found: Corners, want: Corners, tol = 0.035) => found.forEach((p, i) => {
  expect(Math.abs(p[0] - want[i][0])).toBeLessThan(tol);
  expect(Math.abs(p[1] - want[i][1])).toBeLessThan(tol);
});

describe('page detection', () => {
  it('finds a page held at an angle', () => {
    const quad: Corners = [[0.18, 0.12], [0.86, 0.2], [0.8, 0.88], [0.1, 0.8]];
    const d = detectPage(photo(quad));
    expect(d).not.toBeNull();
    near(d!.corners, quad);
    expect(d!.confidence).toBeGreaterThan(0.5);
  });
  it('finds a straight page, with noise', () => {
    const quad: Corners = [[0.12, 0.1], [0.88, 0.1], [0.88, 0.9], [0.12, 0.9]];
    near(detectPage(photo(quad, { noise: 25, seed: 8 }))!.corners, quad);
  });
  it('finds a trapezoid (photo taken from low down)', () => {
    const quad: Corners = [[0.25, 0.1], [0.75, 0.1], [0.92, 0.92], [0.08, 0.92]];
    near(detectPage(photo(quad, { seed: 5 }))!.corners, quad);
  });
  it('finds a page that touches the picture edge', () => {
    const quad: Corners = [[0.0, 0.15], [0.8, 0.1], [0.85, 0.85], [0.0, 0.9]];
    near(detectPage(photo(quad, { seed: 9 }))!.corners, quad, 0.05);
  });
  it('finds a dark page on a light desk', () => {
    const quad: Corners = [[0.15, 0.15], [0.85, 0.12], [0.88, 0.85], [0.12, 0.88]];
    near(detectPage(photo(quad, { page: 50, bg: 200, text: false, seed: 4 }))!.corners, quad);
  });
  it('finds a small page on a big desk', () => {
    const quad: Corners = [[0.3, 0.25], [0.7, 0.25], [0.7, 0.75], [0.3, 0.75]];
    near(detectPage(photo(quad))!.corners, quad);
  });
  it('returns null when there is no page', () => {
    const empty = photo([[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]] as Corners, { seed: 11 });
    expect(detectPage(empty)).toBeNull();
  });
  it('returns null when the page already fills the picture', () => {
    expect(detectPage(photo([[0, 0], [1, 0], [1, 1], [0, 1]]))).toBeNull();
  });
  it('returns null when the page is the same colour as the desk', () => {
    const quad: Corners = [[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]];
    expect(detectPage(photo(quad, { page: 100, bg: 98, noise: 12 }))).toBeNull();
  });
  it('is fast on a big photo (works on a small copy)', () => {
    const big = photo([[0.1, 0.1], [0.9, 0.12], [0.88, 0.9], [0.12, 0.88]], { w: 1600, h: 2000 });
    const t0 = Date.now();
    expect(detectPage(big)).not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('detection success rate on random photos', () => {
  it('finds at least 90% of 40 random pages within 4% of the picture', () => {
    const r = rng(12345);
    let ok = 0;
    const n = 40;
    for (let k = 0; k < n; k++) {
      const jitter = () => (r() - 0.5) * 0.12;
      const quad: Corners = [
        [0.14 + jitter(), 0.1 + jitter()],
        [0.86 + jitter(), 0.1 + jitter()],
        [0.86 + jitter(), 0.9 + jitter()],
        [0.14 + jitter(), 0.9 + jitter()],
      ];
      const page = 200 + Math.floor(r() * 50);
      const bg = 60 + Math.floor(r() * 80);
      const d = detectPage(photo(quad, { page, bg, seed: k + 100, noise: 8 + r() * 14 }));
      if (d && d.corners.every((p, i) => Math.abs(p[0] - quad[i][0]) < 0.04 && Math.abs(p[1] - quad[i][1]) < 0.04)) ok++;
    }
    console.log(`detected ${ok} of ${n}`);
    expect(ok / n).toBeGreaterThanOrEqual(0.9);
  });
});
