import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeIdSheet, resize, SHEET_H, SHEET_W } from '../src/image/idCard';
import { decodeJpeg } from '../src/image/process';
import type { Pixels } from '../src/image/pixels';

const solid = (w: number, h: number, rgb: [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { width: w, height: h, data };
};
const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));

describe('ID sheet', () => {
  it('resizes keeping colour', () => {
    const r = resize(solid(40, 20, [200, 10, 30]), 10, 5);
    expect([r.width, r.height]).toEqual([10, 5]);
    expect(at(r, 5, 2)).toEqual([200, 10, 30]);
  });
  it('puts front above back on a white A4 sheet, centred', () => {
    const s = composeIdSheet(solid(856, 540, [255, 0, 0]), solid(856, 540, [0, 0, 255]));
    expect([s.width, s.height]).toEqual([SHEET_W, SHEET_H]);
    expect(at(s, 5, 5)).toEqual([255, 255, 255]);
    expect(at(s, SHEET_W / 2, 280 + 300)).toEqual([255, 0, 0]);
    expect(at(s, SHEET_W / 2, 280 + 800 + 160 + 300)).toEqual([0, 0, 255]);
    expect(at(s, 10, 280 + 300)).toEqual([255, 255, 255]);
  });
  it('front only leaves the lower part white', () => {
    const s = composeIdSheet(solid(856, 540, [255, 0, 0]));
    expect(at(s, SHEET_W / 2, 280 + 800 + 160 + 300)).toEqual([255, 255, 255]);
  });
  it('handles a tall photo without leaving its box', () => {
    const p = decodeJpeg(new Uint8Array(readFileSync('test/fixtures/portrait.jpg')));
    const s = composeIdSheet(p, p);
    expect(at(s, 3, SHEET_H - 3)).toEqual([255, 255, 255]);
  });
});
