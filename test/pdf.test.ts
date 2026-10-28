import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildPdf, type PageImage } from '../src/pdf/buildPdf';

const portrait: PageImage = { bytes: readFileSync('test/fixtures/portrait.jpg'), format: 'jpg' };
const landscape: PageImage = { bytes: readFileSync('test/fixtures/landscape.jpg'), format: 'jpg' };

describe('buildPdf', () => {
  it('makes a valid PDF with one page per image on A4, landscape scans on landscape pages', async () => {
    const bytes = await buildPdf([portrait, landscape], { pageSize: 'A4', title: 'Prueba' });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2);
    const [a, b] = doc.getPages().map((p) => p.getSize());
    expect(a.width).toBeCloseTo(595.28, 1);
    expect(a.height).toBeCloseTo(841.89, 1);
    expect(b.width).toBeCloseTo(841.89, 1);
    expect(b.height).toBeCloseTo(595.28, 1);
    expect(doc.getTitle()).toBe('Prueba');
    expect(doc.getProducer()).toBe('Ordo');
  });

  it('uses US Letter size', async () => {
    const doc = await PDFDocument.load(await buildPdf([portrait], { pageSize: 'Letter' }));
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('fit mode keeps the image shape with a 842 pt long side', async () => {
    const doc = await PDFDocument.load(await buildPdf([portrait], { pageSize: 'fit' }));
    const { width, height } = doc.getPage(0).getSize();
    expect(height).toBeCloseTo(842, 0);
    expect(width / height).toBeCloseTo(300 / 400, 2);
  });

  it('refuses to build an empty PDF and a broken image', async () => {
    await expect(buildPdf([], { pageSize: 'A4' })).rejects.toThrow();
    await expect(
      buildPdf([{ bytes: new Uint8Array([1, 2, 3]), format: 'jpg' }], { pageSize: 'A4' }),
    ).rejects.toThrow();
  });
});
