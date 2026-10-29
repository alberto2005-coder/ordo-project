/** A decoded picture: RGBA, 4 bytes per pixel. Pure data, so everything here runs the same
 *  on the phone and in tests. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Filter = 'original' | 'enhanced' | 'bw' | 'gray';

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Sum over a (2r+1) square around every pixel, computed with an integral image so the cost
 *  does not grow with the window size. Edges use only the pixels that exist. */
function boxMean(src: Float32Array | Uint8Array, w: number, h: number, radius: number): Float32Array {
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      out[y * w + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

function luma(img: Pixels): Uint8Array {
  const n = img.width * img.height;
  const g = new Uint8Array(n);
  const d = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
  }
  return g;
}

export function toGray(img: Pixels): Pixels {
  const g = luma(img);
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    out[p] = out[p + 1] = out[p + 2] = g[i];
    out[p + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** brightness and contrast in -1..1. 0 changes nothing. */
export function adjust(img: Pixels, brightness: number, contrast: number): Pixels {
  const b = Math.max(-1, Math.min(1, brightness)) * 255 * 0.5;
  const c = Math.max(-1, Math.min(1, contrast));
  const factor = c >= 0 ? 1 + c * 1.5 : 1 + c * 0.8; // soft on the way down, firmer going up
  const out = new Uint8ClampedArray(img.data);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = clamp((out[i] - 128) * factor + 128 + b);
    out[i + 1] = clamp((out[i + 1] - 128) * factor + 128 + b);
    out[i + 2] = clamp((out[i + 2] - 128) * factor + 128 + b);
  }
  return { width: img.width, height: img.height, data: out };
}

/** "Magic" clean-up for paper: estimate the lighting from a wide blur and divide it out, which
 *  evens out shadows and turns grey paper white, then add a little contrast. Colour is kept. */
export function enhance(img: Pixels): Pixels {
  const { width: w, height: h } = img;
  const radius = Math.max(8, Math.round(Math.max(w, h) / 24));
  const n = w * h;
  const out = new Uint8ClampedArray(img.data.length);
  const channel = new Uint8Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) channel[i] = img.data[i * 4 + c];
    const bg = boxMean(channel, w, h, radius);
    for (let i = 0; i < n; i++) {
      // Text is darker than its surroundings, so dividing by the local average lifts the paper to ~white.
      const ratio = channel[i] / Math.max(bg[i], 24);
      const v = ratio * 245;
      // S-curve around mid-grey sharpens ink without crushing light colours.
      const t = clamp(v) / 255;
      out[i * 4 + c] = clamp(255 * (t * t * (3 - 2 * t) * 0.35 + t * 0.65));
    }
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
  return { width: w, height: h, data: out };
}

/** Pure black and white for text: a pixel is ink if it is clearly darker than its neighbourhood. */
export function blackAndWhite(img: Pixels): Pixels {
  const { width: w, height: h } = img;
  const g = luma(img);
  const radius = Math.max(8, Math.round(Math.max(w, h) / 24));
  const mean = boxMean(g, w, h, radius);
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] < mean[i] * 0.86 ? 0 : 255;
    const p = i * 4;
    out[p] = out[p + 1] = out[p + 2] = v;
    out[p + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

export function applyFilter(img: Pixels, filter: Filter): Pixels {
  switch (filter) {
    case 'enhanced':
      return enhance(img);
    case 'bw':
      return blackAndWhite(img);
    case 'gray':
      return toGray(img);
    default:
      return img;
  }
}
