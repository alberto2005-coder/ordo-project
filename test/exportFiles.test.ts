import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../src/export/docx';
import { uniqueNames, zipFiles } from '../src/export/zip';

const dir = mkdtempSync(join(tmpdir(), 'ordo-exp-'));
const jpg = new Uint8Array(readFileSync('test/fixtures/portrait.jpg'));

describe('zip of images', () => {
  it('makes names safe and unique and keeps extensions', () => {
    expect(uniqueNames(['Factura/1.jpg', 'Factura/1.jpg', 'a:b?.jpg', '...hidden.jpg', '', 'X.JPG', 'x.jpg'])).toEqual([
      'Factura 1.jpg',
      'Factura 1 (2).jpg',
      'a b .jpg',
      'hidden.jpg',
      'file',
      'X.JPG',
      'x (2).jpg',
    ]);
  });

  it('is a valid zip that unzip accepts, with the exact bytes back', () => {
    const bytes = zipFiles([
      { name: 'Contrato 1.jpg', bytes: jpg },
      { name: 'Contrato 2.jpg', bytes: jpg },
    ]);
    const f = join(dir, 'test.zip');
    writeFileSync(f, bytes);
    const t = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
    if (t.error === undefined) expect(t.status).toBe(0);
    const back = unzipSync(bytes);
    expect(Object.keys(back)).toEqual(['Contrato 1.jpg', 'Contrato 2.jpg']);
    expect(back['Contrato 2.jpg']).toEqual(jpg);
  });

  it('refuses an empty zip', () => {
    expect(() => zipFiles([])).toThrow();
  });
});

describe('Word export', () => {
  it('writes the text with accents, one paragraph per line, and a page break between pages', async () => {
    const bytes = await buildDocx('Acta', [{ text: 'Reunión del año\nPunto 1: €125,50' }, { text: 'Segunda página ñandú' }]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toContain('word/document.xml');
    const xml = strFromU8(files['word/document.xml']);
    for (const s of ['Reunión del año', 'Punto 1: €125,50', 'Segunda página ñandú']) expect(xml).toContain(s);
    expect(xml).toMatch(/w:br w:type="page"/);
    expect((xml.match(/<w:p[ >]/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('is a file python-docx can open', async () => {
    const f = join(dir, 'a.docx');
    writeFileSync(f, await buildDocx('T', [{ text: 'Hola mundo\nSegunda línea' }]));
    const r = spawnSync('python3', ['-c', 'import sys\nimport docx\nd = docx.Document(sys.argv[1])\nprint("|".join(p.text for p in d.paragraphs))', f], { encoding: 'utf8' });
    if (r.stderr.includes('No module named')) return; // python-docx not installed here
    expect(r.stdout.trim()).toBe('Hola mundo|Segunda línea');
  });

  it('strips control characters that would corrupt the file, and copes with empty text', async () => {
    const f = join(dir, 'b.docx');
    writeFileSync(f, await buildDocx('T', [{ text: 'bien\u0001\u0008mal\u000bfin' }]));
    const xml = strFromU8(unzipSync(new Uint8Array(readFileSync(f)))['word/document.xml']);
    expect(xml).toContain('bienmalfin');
    await expect(buildDocx('', [])).resolves.toBeInstanceOf(Uint8Array);
    await expect(buildDocx('T', [{ text: '' }])).resolves.toBeInstanceOf(Uint8Array);
  });
});
