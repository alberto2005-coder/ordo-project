import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnnotationData } from '../src/data/annotations';
import { burnAnnotations } from '../src/image/burn';
import type { Pixels } from '../src/image/pixels';
import { buildPdf, type PageImage } from '../src/pdf/buildPdf';

const jpg = readFileSync('test/fixtures/portrait.jpg');
const dir = mkdtempSync(join(tmpdir(), 'ordo-ann-'));
const have = (cmd: string) => spawnSync(cmd, ['-v']).error === undefined;

async function renderFirstPage(images: PageImage[], opts: Parameters<typeof buildPdf>[1]) {
  const pdf = join(dir, `t-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(pdf, await buildPdf(images, opts));
  const prefix = pdf.replace('.pdf', '');
  const r = spawnSync('pdftoppm', ['-r', '40', '-png', '-f', '1', '-l', '1', pdf, prefix]);
  expect(r.status).toBe(0);
  const png = spawnSync('bash', ['-c', `ls ${prefix}*.png | head -1`], { encoding: 'utf8' }).stdout.trim();
  return { pdf, png };
}

function countColour(png: string, rgb: [number, number, number], tol = 60) {
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
r,g,b = map(int, sys.argv[2:5]); tol = int(sys.argv[5])
n = 0; xs = []; ys = []
for y in range(im.height):
    for x in range(im.width):
        p = im.getpixel((x,y))
        if abs(p[0]-r)<tol and abs(p[1]-g)<tol and abs(p[2]-b)<tol:
            n += 1; xs.append(x); ys.append(y)
print(n, im.width, im.height, (sum(xs)//n if n else -1), (sum(ys)//n if n else -1))`;
  const out = spawnSync('python3', ['-c', py, png, String(rgb[0]), String(rgb[1]), String(rgb[2]), String(tol)], { encoding: 'utf8' }).stdout.trim().split(' ').map(Number);
  return { count: out[0], width: out[1], height: out[2], cx: out[3], cy: out[4] };
}

describe.skipIf(!have('pdftoppm'))('annotations and watermark in the PDF (rendered with pdftoppm)', () => {
  it('draws a red stroke where it was placed and nowhere near it otherwise', async () => {
    const red: AnnotationData = { kind: 'draw', color: '#ff0000', width: 0.03, points: [[0.1, 0.5], [0.9, 0.5]] };
    const { png } = await renderFirstPage([{ ...({ bytes: jpg, format: 'jpg' } as PageImage), annotations: [red] }], { pageSize: 'A4' });
    const hit = countColour(png, [255, 0, 0]);
    expect(hit.count).toBeGreaterThan(100);
    // The picture is centred on the page, so a stroke at its vertical middle is near the page's middle.
    expect(Math.abs(hit.cy - hit.height / 2)).toBeLessThan(hit.height * 0.08);
    const plain = await renderFirstPage([{ bytes: jpg, format: 'jpg' }], { pageSize: 'A4' });
    expect(countColour(plain.png, [255, 0, 0]).count).toBe(0);
  });

  it('puts typed text into the PDF as real, searchable text (accents included) and survives unsupported symbols', async () => {
    const text: AnnotationData = { kind: 'text', x: 0.1, y: 0.2, text: 'Pagado ñandú 😀', size: 0.06, color: '#0000ff' };
    const { pdf } = await renderFirstPage([{ bytes: jpg, format: 'jpg', annotations: [text] }], { pageSize: 'A4' });
    const out = spawnSync('pdftotext', [pdf, '-'], { encoding: 'utf8' }).stdout;
    expect(out).toContain('Pagado ñandú');
    expect(out).toContain('?'); // the emoji became a question mark instead of breaking the export
  });

  it('draws a signature inside its box', async () => {
    const sig: AnnotationData = { kind: 'signature', x: 0.5, y: 0.7, w: 0.4, aspect: 0.4, color: '#00aa00', strokes: [[[0, 0.5], [0.5, 0.1], [1, 0.9]]] };
    const { png } = await renderFirstPage([{ bytes: jpg, format: 'jpg', annotations: [sig] }], { pageSize: 'A4' });
    const hit = countColour(png, [0, 170, 0]);
    expect(hit.count).toBeGreaterThan(20);
    expect(hit.cx).toBeGreaterThan(hit.width * 0.5); // right half
    expect(hit.cy).toBeGreaterThan(hit.height * 0.5); // lower half
  });

  it('adds a faint watermark that shows up as text, and none when empty', async () => {
    const withMark = await renderFirstPage([{ bytes: jpg, format: 'jpg' }], { pageSize: 'A4', watermark: 'CONFIDENCIAL' });
    // Text set at an angle is read back by pdftotext in a scrambled order, so compare the letters themselves.
    const letters = (t: string) => [...t.replace(/\s/g, '')].sort().join('');
    expect(letters(spawnSync('pdftotext', [withMark.pdf, '-'], { encoding: 'utf8' }).stdout)).toBe(letters('CONFIDENCIAL'));
    const without = await renderFirstPage([{ bytes: jpg, format: 'jpg' }], { pageSize: 'A4', watermark: '   ' });
    expect(spawnSync('pdftotext', [without.pdf, '-'], { encoding: 'utf8' }).stdout.trim()).toBe('');
  });

  it('keeps annotations and watermark when the PDF is password protected', async () => {
    const red: AnnotationData = { kind: 'draw', color: '#ff0000', width: 0.03, points: [[0.1, 0.5], [0.9, 0.5]] };
    const pdf = join(dir, 'enc-ann.pdf');
    writeFileSync(pdf, await buildPdf([{ bytes: jpg, format: 'jpg', annotations: [red] }], { pageSize: 'A4', password: 'clave', watermark: 'COPIA' }));
    const r = spawnSync('pdftoppm', ['-upw', 'clave', '-r', '40', '-png', '-f', '1', '-l', '1', pdf, join(dir, 'enc-ann')]);
    expect(r.status).toBe(0);
    const png = spawnSync('bash', ['-c', `ls ${join(dir, 'enc-ann')}*.png | head -1`], { encoding: 'utf8' }).stdout.trim();
    expect(countColour(png, [255, 0, 0]).count).toBeGreaterThan(100);
  });
});

describe('burning annotations into an image (for JPG export)', () => {
  const blank = (): Pixels => ({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4).fill(255) });
  const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 3));

  it('paints a solid stroke and leaves the original untouched', () => {
    const img = blank();
    const { pixels } = burnAnnotations(img, [{ kind: 'draw', color: '#ff0000', width: 0.06, points: [[0.1, 0.5], [0.9, 0.5]] }]);
    expect(at(pixels, 50, 50)).toEqual([255, 0, 0]);
    expect(at(pixels, 50, 10)).toEqual([255, 255, 255]);
    expect(at(img, 50, 50)).toEqual([255, 255, 255]);
  });

  it('highlights are see-through and overlapping passes do not get darker', () => {
    const once = burnAnnotations(blank(), [{ kind: 'highlight', color: '#ffff00', width: 0.1, points: [[0.1, 0.5], [0.9, 0.5]] }]).pixels;
    const twice = burnAnnotations(blank(), [{ kind: 'highlight', color: '#ffff00', width: 0.1, points: [[0.1, 0.5], [0.9, 0.5], [0.1, 0.5], [0.9, 0.5]] }]).pixels;
    const [r, g, b] = at(once, 50, 50);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeLessThan(200); // tinted yellow, not solid
    expect(b).toBeGreaterThan(100);
    expect(at(twice, 50, 50)).toEqual(at(once, 50, 50));
  });

  it('draws signatures in their box and reports typed text as not drawn', () => {
    const { pixels, skippedText } = burnAnnotations(blank(), [
      { kind: 'signature', x: 0.5, y: 0.5, w: 0.4, aspect: 0.5, color: '#000000', strokes: [[[0, 0.5], [1, 0.5]]] },
      { kind: 'text', x: 0.1, y: 0.1, text: 'hola', size: 0.05, color: '#000000' },
    ]);
    expect(skippedText).toBe(1);
    expect(at(pixels, 70, 60)[0]).toBeLessThan(80); // on the signature line: box x 50..90, vertical middle of a 20 px box starting at y 50
    expect(at(pixels, 20, 20)).toEqual([255, 255, 255]);
  });

  it('copes with strokes partly outside the picture', () => {
    expect(() => burnAnnotations(blank(), [{ kind: 'draw', color: '#000000', width: 0.05, points: [[-0.3, -0.3], [1.4, 1.4]] }])).not.toThrow();
  });
});

import { loadTextFont } from '../src/image/text';
describe('typed text in pictures', () => {
  it('is painted when a font is given and not counted as skipped', () => {
    const img = { width: 300, height: 200, data: new Uint8ClampedArray(300 * 200 * 4).fill(255) };
    const { pixels, skippedText } = burnAnnotations(img, [{ kind: 'text', x: 0.1, y: 0.3, text: 'Firmado', size: 0.1, color: '#0000ff' }], loadTextFont());
    expect(skippedText).toBe(0);
    let blue = 0;
    for (let i = 0; i < pixels.data.length; i += 4) if (pixels.data[i] < 100 && pixels.data[i + 2] > 200) blue++;
    expect(blue).toBeGreaterThan(100);
    // the original picture is not touched
    expect(img.data[0]).toBe(255);
  });
});
