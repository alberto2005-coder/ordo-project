import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPptx, fit } from '../src/export/pptx';
import { buildXlsx, columnName, sheetName, splitCells } from '../src/export/xlsx';
import { jpegSize } from '../src/image/jpegSize';

const dir = mkdtempSync(join(tmpdir(), 'ordo-office-'));
const portrait = new Uint8Array(readFileSync('test/fixtures/portrait.jpg'));
const landscape = new Uint8Array(readFileSync('test/fixtures/landscape.jpg'));
const py = (code: string) => spawnSync('python3', ['-c', code], { encoding: 'utf8' });
const hasPy = (mod: string) => py(`import ${mod}`).status === 0;

describe('helpers', () => {
  it('reads JPEG size from the header', () => {
    const p = jpegSize(portrait);
    const l = jpegSize(landscape);
    expect(p.height).toBeGreaterThan(p.width);
    expect(l.width).toBeGreaterThan(l.height);
    expect(() => jpegSize(new Uint8Array([1, 2, 3]))).toThrow();
  });
  it('names columns and splits cells', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(splitCells('Leche   1,50\t2 uds')).toEqual(['Leche', '1,50', '2 uds']);
    expect(splitCells('   ')).toEqual([]);
  });
  it('makes sheet names valid and unique', () => {
    const used = new Set<string>();
    expect(sheetName('Page/1:[x]', used)).toBe('Page 1  x');
    expect(sheetName('Page/1:[x]', used)).not.toBe('Page 1  x');
    expect(sheetName('a'.repeat(50), new Set()).length).toBe(31);
  });
  it('fits a picture inside the slide', () => {
    const p = fit(1000, 2000);
    expect(p.cy).toBeLessThanOrEqual(6858000);
    expect(Math.abs(p.cx / p.cy - 0.5)).toBeLessThan(0.001);
  });
});

describe('xlsx', () => {
  it('opens in openpyxl with the right cells and numbers', () => {
    if (!hasPy('openpyxl')) return;
    const f = join(dir, 'a.xlsx');
    writeFileSync(f, buildXlsx([{ name: 'Page 1', text: 'Producto   Precio\nLeche  1,50\nPan  0.8 & <más>' }, { name: 'Page 2', text: 'Solo texto' }]));
    const r = py(`import openpyxl,json;wb=openpyxl.load_workbook(${JSON.stringify(f)});print(json.dumps([wb.sheetnames,[[c.value for c in r] for r in wb.worksheets[0].iter_rows()],wb.worksheets[1]['A1'].value]))`);
    expect(r.status).toBe(0);
    const [names, rows, second] = JSON.parse(r.stdout);
    expect(names).toEqual(['Page 1', 'Page 2']);
    expect(rows).toEqual([['Producto', 'Precio'], ['Leche', 1.5], ['Pan', '0.8 & <más>']]);
    expect(second).toBe('Solo texto');
  });
  it('refuses no sheets', () => expect(() => buildXlsx([])).toThrow());
});

describe('pptx', () => {
  it('opens in python-pptx with one picture per slide', () => {
    if (!hasPy('pptx')) return;
    const f = join(dir, 'a.pptx');
    writeFileSync(f, buildPptx([portrait, landscape, portrait]));
    const r = py(`from pptx import Presentation;import json;p=Presentation(${JSON.stringify(f)});print(json.dumps([[s.shape_type for s in sl.shapes] and len(sl.shapes) for sl in p.slides]+[len(p.slides.__iter__.__self__._sldIdLst)]))`);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([1, 1, 1, 3]);
  });
  it('converts with LibreOffice when it is installed', () => {
    const f = join(dir, 'a.pptx');
    writeFileSync(f, buildPptx([portrait, landscape]));
    const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, f], { encoding: 'utf8', timeout: 90000 });
    if (r.error) return;
    expect(r.status).toBe(0);
    const out = py(`from pypdf import PdfReader;print(len(PdfReader(${JSON.stringify(join(dir, 'a.pdf'))}).pages))`);
    if (out.status === 0) expect(out.stdout.trim()).toBe('2');
  });
  it('refuses no slides', () => expect(() => buildPptx([])).toThrow());
});
