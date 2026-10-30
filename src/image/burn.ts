import type { AnnotationData, Point } from '@/data/annotations';
import type { Pixels } from './pixels';
import { drawText, type Font } from './text';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paints a round-ended thick line by testing each pixel near the segment. */
function line(img: Pixels, a: [number, number], b: [number, number], radius: number, rgb: [number, number, number], alpha: number) {
  const { width: w, height: h, data } = img;
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius - 1));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0]) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius - 1));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1]) + radius + 1));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
      const d = Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
      if (d > radius) continue;
      // Soft one-pixel edge so lines are not jagged.
      const cover = Math.min(1, radius - d + 0.5) * alpha;
      const i = (y * w + x) * 4;
      data[i] = data[i] * (1 - cover) + rgb[0] * cover;
      data[i + 1] = data[i + 1] * (1 - cover) + rgb[1] * cover;
      data[i + 2] = data[i + 2] * (1 - cover) + rgb[2] * cover;
    }
  }
}

function stroke(img: Pixels, pts: Point[], thickness: number, color: string, alpha: number) {
  const rgb = hex(color);
  const px = pts.map(([x, y]): [number, number] => [x * img.width, y * img.height]);
  const r = Math.max(0.75, thickness / 2);
  if (px.length === 1) line(img, px[0], px[0], r, rgb, alpha);
  for (let i = 1; i < px.length; i++) line(img, px[i - 1], px[i], r, rgb, alpha);
}

/** Draws drawings, highlights, signatures and typed text onto a copy of the picture.
 *  Typed text needs a font: without one it is not drawn and is counted in `skippedText` so the screen can say so. */
export function burnAnnotations(img: Pixels, annotations: AnnotationData[], font?: Font): { pixels: Pixels; skippedText: number } {
  const out: Pixels = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  let skippedText = 0;
  for (const a of annotations) {
    if (a.kind === 'draw') stroke(out, a.points, a.width * img.width, a.color, 1);
    else if (a.kind === 'highlight') {
      // Highlights are painted in one go per pixel so overlapping segments do not darken.
      const layer: Pixels = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.length) };
      stroke(layer, a.points, a.width * img.width, '#ffffff', 1);
      const rgb = hex(a.color);
      for (let i = 0; i < layer.data.length; i += 4) {
        const cover = (layer.data[i] / 255) * 0.35;
        if (cover <= 0) continue;
        out.data[i] = out.data[i] * (1 - cover) + rgb[0] * cover;
        out.data[i + 1] = out.data[i + 1] * (1 - cover) + rgb[1] * cover;
        out.data[i + 2] = out.data[i + 2] * (1 - cover) + rgb[2] * cover;
      }
    } else if (a.kind === 'signature') {
      const boxW = a.w * img.width;
      const boxH = boxW * a.aspect;
      for (const s of a.strokes) {
        const mapped = s.map(([sx, sy]): Point => [(a.x * img.width + sx * boxW) / img.width, (a.y * img.height + sy * boxH) / img.height]);
        stroke(out, mapped, Math.max(1.5, boxW * 0.012), a.color, 1);
      }
    } else if (a.kind === 'text') {
      if (!font) skippedText++;
      else drawText(out, font, a.text, a.x * img.width, a.y * img.height, Math.max(4, a.size * img.width), hex(a.color));
    }
  }
  return { pixels: out, skippedText };
}
