import type { Pixels } from './pixels';

/** Where the two pages of an open book meet: the darkest vertical band near the middle (the shadow in the fold).
 *  Returns the column to cut at. Falls back to the exact middle when there is no clear shadow. */
export function findGutter(img: Pixels): number {
  const { width: w, height: h, data } = img;
  const from = Math.floor(w * 0.35);
  const to = Math.ceil(w * 0.65);
  const rows = Math.min(h, 200);
  const stepY = Math.max(1, Math.floor(h / rows));
  const cols: number[] = [];
  for (let x = from; x < to; x++) {
    const vals: number[] = [];
    // Ignore the top and bottom edges, which often show the desk.
    for (let y = Math.floor(h * 0.1); y < h * 0.9; y += stepY) {
      const i = (y * w + x) * 4;
      vals.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    // The median is the paper: letters are a minority of the rows and do not move it.
    vals.sort((a, b) => a - b);
    cols.push(vals[Math.floor(vals.length / 2)]);
  }
  // Smooth over a few columns so one dark letter does not decide it.
  const r = Math.max(2, Math.round(w * 0.01));
  let best = -1;
  let bestVal = Infinity;
  let max = -Infinity;
  const smooth = cols.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = -r; k <= r; k++) {
      const v = cols[i + k];
      if (v !== undefined) (s += v), n++;
    }
    return s / n;
  });
  smooth.forEach((v, i) => {
    if (v < bestVal) (bestVal = v), (best = i);
    if (v > max) max = v;
  });
  // A "fold" at the very edge of the search window is really a window border, a
  // toolbar or the edge of the picture, not the middle of the book.
  const margin = Math.max(2, Math.round(smooth.length * 0.05));
  if (best < margin || best > smooth.length - 1 - margin) return Math.round(w / 2);
  // A real fold is clearly darker than the paper around it. Otherwise cut in the middle.
  if (max - bestVal < 12) return Math.round(w / 2);
  return from + best;
}

function slice(img: Pixels, x0: number, x1: number): Pixels {
  const w = x1 - x0;
  const out = new Uint8ClampedArray(w * img.height * 4);
  for (let y = 0; y < img.height; y++) {
    out.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1) * 4), y * w * 4);
  }
  return { width: w, height: img.height, data: out };
}

/** Cuts a photo of an open book into its left and right pages. */
export function splitSpread(img: Pixels): [Pixels, Pixels] {
  const cut = Math.min(img.width - 2, Math.max(2, findGutter(img)));
  return [slice(img, 0, cut), slice(img, cut, img.width)];
}
