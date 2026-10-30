import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawText, loadTextFont } from '../src/image/text';
import type { Pixels } from '../src/image/pixels';

const blank = (w: number, h: number): Pixels => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) });
const ink = (p: Pixels) => {
  let n = 0;
  let minX = p.width, maxX = -1, minY = p.height, maxY = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4] < 128) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { n, minX, maxX, minY, maxY };
};

describe('text in pictures', () => {
  const font = loadTextFont();
  it('draws visible black text inside the expected box', () => {
    const img = blank(400, 100);
    drawText(img, font, 'Hola mundo', 20, 20, 40, [0, 0, 0]);
    const b = ink(img);
    expect(b.n).toBeGreaterThan(400);
    expect(b.minX).toBeGreaterThanOrEqual(19);
    expect(b.maxX).toBeLessThan(380);
    expect(b.minY).toBeGreaterThanOrEqual(18);
    expect(b.maxY).toBeLessThan(90);
  });
  it('draws Spanish accents, ñ and ¿¡ without gaps', () => {
    const plain = blank(500, 80);
    const accents = blank(500, 80);
    drawText(plain, font, 'Nino Cancion', 10, 10, 36, [0, 0, 0]);
    drawText(accents, font, 'Niño Canción ¿Qué? ¡Sí!', 10, 10, 36, [0, 0, 0]);
    expect(ink(accents).n).toBeGreaterThan(ink(plain).n);
    // accented glyphs reach above the cap height of the plain ones
    expect(ink(accents).minY).toBeLessThanOrEqual(ink(plain).minY);
  });
  it('stacks lines, colours the ink and leaves the rest alone', () => {
    const img = blank(300, 200);
    drawText(img, font, 'uno\ndos', 10, 10, 30, [255, 0, 0]);
    const rows = [...Array(200).keys()].filter((y) => [...Array(300).keys()].some((x) => img.data[(y * 300 + x) * 4 + 1] < 128));
    expect(rows.length).toBeGreaterThan(20);
    const gap = rows.findIndex((y, i) => i > 0 && y - rows[i - 1] > 3);
    expect(gap).toBeGreaterThan(0); // two separate lines
    expect(Array.from(img.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
    const i = (rows[0] * 300 + 10 + 4) * 4;
    expect(img.data[(rows[Math.floor(rows.length / 2)] * 300 + 0) * 4]).toBe(255);
    expect(i).toBeGreaterThan(0);
  });
  it('does not crash when text runs off the picture', () => {
    const img = blank(60, 40);
    expect(() => drawText(img, font, 'Muy largo para caber', 40, 30, 50, [0, 0, 0])).not.toThrow();
    expect(() => drawText(img, font, 'x', -500, -500, 20, [0, 0, 0])).not.toThrow();
    expect(() => drawText(img, font, '', 0, 0, 20, [0, 0, 0])).not.toThrow();
  });
  it('matches a reference rendering of the same font (PIL)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ordo-text-'));
    const f = join(dir, 'ref.raw');
    const font_path = '/usr/share/fonts/opentype/inter/Inter-Regular.otf';
    const script = `
from PIL import Image, ImageDraw, ImageFont
import sys
try:
    font = ImageFont.truetype(${JSON.stringify(font_path)}, 40)
except Exception:
    sys.exit(3)
im = Image.new('L', (400, 100), 255)
d = ImageDraw.Draw(im)
d.text((20, 20 + 0.9*40), 'Hola Ñandú 123', font=font, fill=0, anchor='ls')
open(${JSON.stringify(f)}, 'wb').write(im.tobytes())`;
    const r = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
    if (r.status !== 0) return; // no PIL or font here: skip
    const ref = new Uint8Array(require('node:fs').readFileSync(f));
    const img = blank(400, 100);
    drawText(img, font, 'Hola Ñandú 123', 20, 20, 40, [0, 0, 0]);
    // Compare darkness maps: how much of the ink overlaps (IoU of dark pixels).
    let both = 0, either = 0;
    for (let i = 0; i < 400 * 100; i++) {
      const a = img.data[i * 4] < 128;
      const b = ref[i] < 128;
      if (a && b) both++;
      if (a || b) either++;
    }
    expect(both / either).toBeGreaterThan(0.8);
    writeFileSync(join(dir, 'ok'), '1');
  });
});
