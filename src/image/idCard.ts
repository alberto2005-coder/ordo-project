import type { Pixels } from './pixels';

/** A4 at 200 dpi. */
export const SHEET_W = 1654;
export const SHEET_H = 2339;

/** Bilinear shrink or grow to the given size. */
export function resize(src: Pixels, width: number, height: number): Pixels {
  const out = new Uint8ClampedArray(width * height * 4);
  const xr = src.width / width;
  const yr = src.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) * yr - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) * xr - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c] * (1 - fx) + src.data[(y0 * src.width + x1) * 4 + c] * fx;
        const b = src.data[(y1 * src.width + x0) * 4 + c] * (1 - fx) + src.data[(y1 * src.width + x1) * 4 + c] * fx;
        out[(y * width + x) * 4 + c] = a * (1 - fy) + b * fy;
      }
    }
  }
  return { width, height, data: out };
}

function paste(dst: Pixels, img: Pixels, left: number, top: number) {
  for (let y = 0; y < img.height; y++) {
    const dy = top + y;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < img.width; x++) {
      const dx = left + x;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (y * img.width + x) * 4;
      const d = (dy * dst.width + dx) * 4;
      dst.data[d] = img.data[s];
      dst.data[d + 1] = img.data[s + 1];
      dst.data[d + 2] = img.data[s + 2];
      dst.data[d + 3] = 255;
    }
  }
}

/** Both sides of an ID card on one white A4 sheet, front above back, centred and the same width.
 *  With only a front, it sits alone in the upper half. Keeps each side's shape. */
export function composeIdSheet(front: Pixels, back?: Pixels | null): Pixels {
  const sheet: Pixels = { width: SHEET_W, height: SHEET_H, data: new Uint8ClampedArray(SHEET_W * SHEET_H * 4).fill(255) };
  const maxW = 1100;
  const maxH = 800;
  const place = (img: Pixels, top: number) => {
    const s = Math.min(maxW / img.width, maxH / img.height);
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    paste(sheet, resize(img, w, h), Math.round((SHEET_W - w) / 2), top);
  };
  place(front, 280);
  if (back) place(back, 280 + maxH + 160);
  return sheet;
}
