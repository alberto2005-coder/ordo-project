import { resize } from './idCard';
import type { Pixels } from './pixels';
import { isConvex, parseCorners, polygonArea, type Corners, type Pt } from './warp';

const WORK_SIDE = 320;

function grayscale(img: Pixels): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return g;
}

/** Box blur by running sums: two passes of radius r. */
function blur(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(g.length);
  const out = new Float32Array(g.length);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += g[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / k;
      sum += g[y * w + Math.min(w - 1, x + r + 1)] - g[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function otsu(g: Float32Array): number {
  const hist = new Float64Array(256);
  for (const v of g) hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  const total = g.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** The largest 4-connected region of set pixels, as a list of its pixel indexes. */
function largestRegion(mask: Uint8Array, w: number, h: number): number[] {
  const seen = new Uint8Array(mask.length);
  let best: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const region: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      region.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), stack.push(p - 1);
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), stack.push(p + 1);
      if (y > 0 && mask[p - w] && !seen[p - w]) (seen[p - w] = 1), stack.push(p - w);
      if (y < h - 1 && mask[p + w] && !seen[p + w]) (seen[p + w] = 1), stack.push(p + w);
    }
    if (region.length > best.length) best = region;
  }
  return best;
}

/** Grows then shrinks the set pixels by r, which joins small gaps (text running into the page edge, creases). */
function close(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pass = (src: Uint8Array, grow: boolean): Uint8Array => {
    const tmp = new Uint8Array(src.length);
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = grow ? 0 : 1;
        for (let k = -r; k <= r; k++) {
          const xx = Math.min(w - 1, Math.max(0, x + k));
          const v = src[y * w + xx];
          if (grow ? v : !v) {
            hit = grow ? 1 : 0;
            break;
          }
        }
        tmp[y * w + x] = hit;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = grow ? 0 : 1;
        for (let k = -r; k <= r; k++) {
          const yy = Math.min(h - 1, Math.max(0, y + k));
          const v = tmp[yy * w + x];
          if (grow ? v : !v) {
            hit = grow ? 1 : 0;
            break;
          }
        }
        out[y * w + x] = hit;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Closes small holes (text, creases) so the page is one solid region: fill every background area that does not touch the border. */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!mask[p] && !outside[p]) {
      outside[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

function quadFromRegion(region: number[], w: number): Corners {
  // The four extreme points: smallest x+y is the top-left, largest x+y the bottom-right, and so on.
  let tl = region[0];
  let tr = region[0];
  let br = region[0];
  let bl = region[0];
  const sum = (p: number) => (p % w) + ((p / w) | 0);
  const diff = (p: number) => (p % w) - ((p / w) | 0);
  for (const p of region) {
    if (sum(p) < sum(tl)) tl = p;
    if (sum(p) > sum(br)) br = p;
    if (diff(p) > diff(tr)) tr = p;
    if (diff(p) < diff(bl)) bl = p;
  }
  const pt = (p: number): Pt => [(p % w) + 0.5, ((p / w) | 0) + 0.5];
  return [pt(tl), pt(tr), pt(br), pt(bl)];
}

/** How sharp the boundary is: for each side of the quad, the brightness just inside minus just outside (sign flipped for
 *  a dark page). Sides lying on the picture's own border have no outside and are skipped. Returns the weakest checked side
 *  and how many sides were checked. A real page has a clear step on every checked side; a lighting gradient does not. */
function edgeStep(g: Float32Array, w: number, h: number, quad: Corners, bright: boolean): { weakest: number; sides: number } {
  const px = quad.map(([x, y]) => [x * w, y * h]) as Pt[];
  const cx = px.reduce((a, p) => a + p[0], 0) / 4;
  const cy = px.reduce((a, p) => a + p[1], 0) / 4;
  const at = (x: number, y: number) => g[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  const off = 3;
  let weakest = Infinity;
  let sides = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = px[i];
    const [bx, by] = px[(i + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 4) continue;
    // Unit normal pointing away from the page centre.
    let nx = -(by - ay) / len;
    let ny = (bx - ax) / len;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) (nx = -nx), (ny = -ny);
    const onBorder = (x: number, y: number) => x - off < 1 || y - off < 1 || x + off > w - 2 || y + off > h - 2;
    const steps: number[] = [];
    // Skip the corners, where the two sides meet.
    for (let k = 1; k < 20; k++) {
      const t = k / 20;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (onBorder(x, y)) continue;
      const inside = (at(x - nx * off, y - ny * off) + at(x - nx * (off + 1), y - ny * (off + 1))) / 2;
      const outside = (at(x + nx * off, y + ny * off) + at(x + nx * (off + 1), y + ny * (off + 1))) / 2;
      steps.push(bright ? inside - outside : outside - inside);
    }
    if (steps.length < 6) continue; // mostly on the picture border
    steps.sort((m, n) => m - n);
    sides++;
    weakest = Math.min(weakest, steps[Math.floor(steps.length / 2)]);
  }
  return { weakest, sides };
}

export interface Detection {
  corners: Corners;
  /** 0..1: how well the found region looks like a four-sided page. */
  confidence: number;
}

/** Finds the page in a photo: a brighter (or darker) four-sided region against its surroundings.
 *  Returns null when nothing convincing is found (page fills the picture, same colour as the table, no clear shape).
 *  Works on a small copy, so it is fast; the corners are fractions of the picture and fit the full-size one. */
export function detectPage(img: Pixels): Detection | null {
  const s = Math.min(1, WORK_SIDE / Math.max(img.width, img.height));
  const small = s < 1 ? resize(img, Math.max(8, Math.round(img.width * s)), Math.max(8, Math.round(img.height * s))) : img;
  const { width: w, height: h } = small;
  const g = blur(grayscale(small), w, h, 2);
  const t = otsu(g);
  const total = w * h;
  let best: Detection | null = null;

  for (const bright of [true, false]) {
    let mask: Uint8Array = new Uint8Array(total);
    for (let i = 0; i < total; i++) mask[i] = bright ? (g[i] > t ? 1 : 0) : g[i] < t ? 1 : 0;
    mask = fillHoles(close(mask, w, h, 4), w, h);
    const region = largestRegion(mask, w, h);
    const frac = region.length / total;
    if (frac < 0.15 || frac > 0.97) continue;
    const quad = quadFromRegion(region, w);
    const norm = quad.map(([x, y]) => [x / w, y / h]) as Corners;
    const parsed = parseCorners(norm);
    if (!parsed || !isConvex(parsed)) continue;
    // A real page fills most of its own four-sided hull; a blob or an L-shape does not.
    const fill = region.length / total / polygonArea(parsed);
    if (fill < 0.8 || fill > 1.15) continue;
    // A page that is mostly outside the frame or sliced by the border would look like a sliver.
    const step = edgeStep(g, w, h, parsed, bright);
    if (step.sides < 2 || step.weakest < 18) continue;
    const confidence = Math.max(0, Math.min(1, 1 - Math.abs(1 - fill) * 2)) * Math.min(1, frac * 4) * Math.min(1, step.weakest / 30);
    if (!best || confidence > best.confidence) best = { corners: parsed, confidence };
  }
  return best && best.confidence >= 0.25 ? best : null;
}
