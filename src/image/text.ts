import opentype from 'opentype.js';
import { TEXT_FONT_BASE64 } from '../assets/textFont';
import type { Pixels } from './pixels';

export type Font = opentype.Font;

let cached: Font | null = null;
/** The bundled font (Inter Regular, Latin letters). Parsed once. */
export function loadTextFont(): Font {
  if (cached) return cached;
  const bin = atob(TEXT_FONT_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  cached = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return cached;
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: 1 | -1;
}

/** Turns a glyph path into straight edges, cutting curves into short pieces. */
function toEdges(path: opentype.Path): Edge[] {
  const edges: Edge[] = [];
  let sx = 0;
  let sy = 0;
  let cx = 0;
  let cy = 0;
  const line = (x: number, y: number) => {
    if (y !== cy) edges.push(y > cy ? { x0: cx, y0: cy, x1: x, y1: y, dir: 1 } : { x0: x, y0: y, x1: cx, y1: cy, dir: -1 });
    cx = x;
    cy = y;
  };
  for (const c of path.commands) {
    if (c.type === 'M') {
      cx = sx = c.x;
      cy = sy = c.y;
    } else if (c.type === 'L') line(c.x, c.y);
    else if (c.type === 'Q') {
      const [px, py] = [cx, cy];
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const u = 1 - t;
        line(u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y);
      }
    } else if (c.type === 'C') {
      const [px, py] = [cx, cy];
      for (let i = 1; i <= 14; i++) {
        const t = i / 14;
        const u = 1 - t;
        line(u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y);
      }
    } else if (c.type === 'Z') line(sx, sy);
  }
  return edges;
}

const SUB = 4; // sub-scanlines per pixel row

/** Paints `text` onto the picture. `x` is the left edge, `top` the top of the first line; lines are 1.2 times the size apart,
 *  and the baseline sits 0.9 sizes below the top, the same as the on-screen annotation layer. Anti-aliased, non-zero fill. */
export function drawText(img: Pixels, font: Font, text: string, x: number, top: number, size: number, rgb: [number, number, number], alpha = 1) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (!line) return;
    const baseline = top + size * (0.9 + i * 1.2);
    const edges = toEdges(font.getPath(line, x, baseline, size));
    if (!edges.length) return;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of edges) {
      minY = Math.min(minY, e.y0);
      maxY = Math.max(maxY, e.y1);
      minX = Math.min(minX, e.x0, e.x1);
      maxX = Math.max(maxX, e.x0, e.x1);
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(img.height - 1, Math.ceil(maxY));
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(img.width - 1, Math.ceil(maxX));
    if (y1 < y0 || x1 < x0) return;
    const w = x1 - x0 + 1;
    const cover = new Float32Array(w);
    for (let y = y0; y <= y1; y++) {
      cover.fill(0);
      for (let s = 0; s < SUB; s++) {
        const sy = y + (s + 0.5) / SUB;
        const hits: { x: number; dir: number }[] = [];
        for (const e of edges) {
          if (sy < e.y0 || sy >= e.y1) continue;
          hits.push({ x: e.x0 + ((sy - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
        }
        hits.sort((a, b) => a.x - b.x);
        let wind = 0;
        for (let k = 0; k < hits.length - 1; k++) {
          wind += hits[k].dir;
          if (wind === 0) continue;
          // Fill between this crossing and the next, counting partial pixels at both ends.
          const a = Math.max(x0, hits[k].x);
          const b = Math.min(x1 + 1, hits[k + 1].x);
          if (b <= a) continue;
          const ia = Math.floor(a);
          const ib = Math.floor(b);
          if (ia === ib) cover[ia - x0] += (b - a) / SUB;
          else {
            cover[ia - x0] += (ia + 1 - a) / SUB;
            for (let px = ia + 1; px < ib; px++) cover[px - x0] += 1 / SUB;
            if (ib <= x1) cover[ib - x0] += (b - ib) / SUB;
          }
        }
      }
      for (let px = 0; px < w; px++) {
        const c = Math.min(1, cover[px]) * alpha;
        if (c <= 0) continue;
        const o = (y * img.width + x0 + px) * 4;
        img.data[o] = img.data[o] * (1 - c) + rgb[0] * c;
        img.data[o + 1] = img.data[o + 1] * (1 - c) + rgb[1] * c;
        img.data[o + 2] = img.data[o + 2] * (1 - c) + rgb[2] * c;
      }
    }
  });
}
