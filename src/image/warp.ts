import type { Pixels } from './pixels';

export type Pt = [number, number];
/** Top-left, top-right, bottom-right, bottom-left, as fractions (0..1) of the picture. */
export type Corners = [Pt, Pt, Pt, Pt];

export const FULL_PAGE: Corners = [[0, 0], [1, 0], [1, 1], [0, 1]];

export function isFullPage(c: Corners | null | undefined): boolean {
  return !c || c.every((p, i) => Math.abs(p[0] - FULL_PAGE[i][0]) < 0.002 && Math.abs(p[1] - FULL_PAGE[i][1]) < 0.002);
}

/** Checks stored corners: four numbers pairs in range, in a sensible order, enclosing a real area. */
export function parseCorners(raw: unknown): Corners | null {
  let v = raw;
  if (typeof raw === 'string') {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v) || v.length !== 4) return null;
  if (!v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -0.001 && n <= 1.001))) return null;
  const c = v.map((p) => [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]) as Corners;
  return polygonArea(c) >= 0.01 && isConvex(c) ? c : null;
}

export function polygonArea(c: Corners): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = c[i];
    const [x2, y2] = c[(i + 1) % 4];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function isConvex(c: Corners): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[(i + 1) % 4];
    const [cx, cy] = c[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Maps the unit square to the quad (Heckbert's projective mapping). Returns [a..h] with
 *  x = (a u + b v + c) / (g u + h v + 1), y = (d u + e v + f) / (g u + h v + 1). */
function squareToQuad(q: [number, number][]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

/** The size the straightened page should have: the average of opposite sides, in source pixels. */
export function outputSize(src: { width: number; height: number }, c: Corners, maxSide: number): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * src.width, (a[1] - b[1]) * src.height);
  let w = (d(c[0], c[1]) + d(c[3], c[2])) / 2;
  let h = (d(c[0], c[3]) + d(c[1], c[2])) / 2;
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * s));
  h = Math.max(1, Math.round(h * s));
  return { width: w, height: h };
}

/** Cuts the quad out of the picture and stretches it to a rectangle (perspective correction). Bilinear sampling. */
export function warpPerspective(src: Pixels, corners: Corners, maxSide = 2000): Pixels {
  const { width, height } = outputSize(src, corners, maxSide);
  const quad = corners.map(([x, y]) => [x * src.width, y * src.height]) as [number, number][];
  const [a, b, c, d, e, f, g, h] = squareToQuad(quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const w = g * u + h * v + 1;
      const sx = Math.min(sw - 1, Math.max(0, (a * u + b * v + c) / w - 0.5));
      const sy = Math.min(sh - 1, Math.max(0, (d * u + e * v + f) / w - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) {
        const top = src.data[(y0 * sw + x0) * 4 + k] * (1 - fx) + src.data[(y0 * sw + x1) * 4 + k] * fx;
        const bot = src.data[(y1 * sw + x0) * 4 + k] * (1 - fx) + src.data[(y1 * sw + x1) * 4 + k] * fx;
        out[o + k] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { width, height, data: out };
}

/** Turns the picture clockwise by 0, 90, 180 or 270 degrees. */
export function rotate(src: Pixels, degrees: 0 | 90 | 180 | 270): Pixels {
  if (degrees === 0) return src;
  const { width: w, height: h } = src;
  const swap = degrees !== 180;
  const out = new Uint8ClampedArray(src.data.length);
  const ow = swap ? h : w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (degrees === 90) [nx, ny] = [h - 1 - y, x];
      else if (degrees === 180) [nx, ny] = [w - 1 - x, h - 1 - y];
      else [nx, ny] = [y, w - 1 - x];
      const s = (y * w + x) * 4;
      const d = (ny * ow + nx) * 4;
      out[d] = src.data[s];
      out[d + 1] = src.data[s + 1];
      out[d + 2] = src.data[s + 2];
      out[d + 3] = src.data[s + 3];
    }
  }
  return { width: swap ? h : w, height: swap ? w : h, data: out };
}
