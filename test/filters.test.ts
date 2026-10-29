import { describe, expect, it } from 'vitest';
import { adjust, blackAndWhite, enhance, toGray, type Pixels } from '../src/image/pixels';
import { decodeJpeg, editJpeg, encodeJpeg, isNoEdit, NO_EDIT } from '../src/image/process';

/** A fake page photo: grey paper that is brighter on the left than the right (uneven lighting),
 *  with dark text-like bars. Returns the pixels and a mask of which pixels are ink. */
function fakePage(w = 240, h = 320) {
  const data = new Uint8ClampedArray(w * h * 4);
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const light = 215 - (x / w) * 70; // 215 on the left, 145 on the right
      const isInk = y % 40 > 14 && y % 40 < 22 && x > 20 && x < w - 20;
      const v = isInk ? light * 0.35 : light;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v * 0.98;
      data[i + 3] = 255;
      ink[y * w + x] = isInk ? 1 : 0;
    }
  }
  return { img: { width: w, height: h, data } as Pixels, ink };
}

function stats(img: Pixels, ink: Uint8Array, region: 'paper' | 'ink', xRange?: [number, number]) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (xRange && (x < xRange[0] || x >= xRange[1])) continue;
      if ((ink[y * img.width + x] === 1) !== (region === 'ink')) continue;
      sum += img.data[(y * img.width + x) * 4];
      n++;
    }
  }
  return sum / n;
}

describe('filters', () => {
  const { img, ink } = fakePage();

  it('enhance lifts the paper towards white, evens the lighting and keeps the ink dark', () => {
    const out = enhance(img);
    const left = stats(out, ink, 'paper', [0, 60]);
    const right = stats(out, ink, 'paper', [180, 240]);
    expect(left).toBeGreaterThan(225);
    expect(right).toBeGreaterThan(225);
    expect(Math.abs(left - right)).toBeLessThan(12); // was about 55 apart before
    expect(stats(out, ink, 'ink')).toBeLessThan(140);
    expect(stats(img, ink, 'paper', [0, 60]) - stats(img, ink, 'paper', [180, 240])).toBeGreaterThan(40);
  });

  it('black and white gives only 0 or 255, text black and paper white, even under uneven light', () => {
    const out = blackAndWhite(img);
    const values = new Set<number>();
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i]);
    expect([...values].sort()).toEqual([0, 255]);
    expect(stats(out, ink, 'ink')).toBeLessThan(40);
    expect(stats(out, ink, 'paper')).toBeGreaterThan(245);
  });

  it('gray removes colour', () => {
    const colour: Pixels = { width: 1, height: 1, data: new Uint8ClampedArray([200, 50, 10, 255]) };
    const g = toGray(colour).data;
    expect(g[0]).toBe(g[1]);
    expect(g[1]).toBe(g[2]);
    expect(g[0]).toBeGreaterThan(50);
    expect(g[0]).toBeLessThan(200);
  });

  it('brightness and contrast move values the right way and 0 changes nothing', () => {
    const px: Pixels = { width: 2, height: 1, data: new Uint8ClampedArray([100, 100, 100, 255, 200, 200, 200, 255]) };
    expect(Array.from(adjust(px, 0, 0).data)).toEqual(Array.from(px.data));
    expect(adjust(px, 0.5, 0).data[0]).toBeGreaterThan(100);
    expect(adjust(px, -0.5, 0).data[0]).toBeLessThan(100);
    const more = adjust(px, 0, 0.5).data;
    expect(more[4] - more[0]).toBeGreaterThan(100);
    const less = adjust(px, 0, -0.5).data;
    expect(less[4] - less[0]).toBeLessThan(100);
  });

  it('never leaves the 0 to 255 range and keeps full opacity', () => {
    const extreme: Pixels = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 128, 255]) };
    const out = adjust(extreme, 1, 1).data;
    expect(out[0]).toBe(255); // already white stays white
    expect(out[1]).toBe(0); // already black stays black
    expect(out[3]).toBe(255);
    const e = enhance(img).data;
    for (let i = 0; i < e.length; i++) {
      if (i % 4 === 3) expect(e[i]).toBe(255);
      else expect(e[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('editJpeg', () => {
  const { img } = fakePage(120, 160);
  const jpg = encodeJpeg(img, 90);

  it('returns the very same bytes when nothing is changed', () => {
    expect(isNoEdit(NO_EDIT)).toBe(true);
    expect(editJpeg(jpg, NO_EDIT)).toBe(jpg);
  });

  it('decodes, filters and re-encodes a real JPEG', () => {
    const out = editJpeg(jpg, { filter: 'bw', brightness: 0, contrast: 0 });
    const back = decodeJpeg(out);
    expect(back.width).toBe(120);
    expect(back.height).toBe(160);
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
  });

  it('handles a one-pixel image and a tiny image without crashing', () => {
    const tiny: Pixels = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255]) };
    for (const f of ['enhanced', 'bw', 'gray'] as const) {
      expect(() => editJpeg(encodeJpeg(tiny), { filter: f, brightness: 0.2, contrast: 0.2 })).not.toThrow();
    }
  });
});

describe('speed', () => {
  it('filters a 2-megapixel page in a reasonable time (a rough guide for the phone)', () => {
    const big: Pixels = { width: 1500, height: 1333, data: new Uint8ClampedArray(1500 * 1333 * 4).fill(180) };
    const t0 = performance.now();
    enhance(big);
    blackAndWhite(big);
    const ms = performance.now() - t0;
    console.log(`enhance + black and white on 2 MP: ${Math.round(ms)} ms on this machine`);
    expect(ms).toBeLessThan(5000);
  });
});
