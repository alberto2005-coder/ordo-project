import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPdf } from '../src/pdf/buildPdf';

const portrait = new Uint8Array(readFileSync('test/fixtures/portrait.jpg'));
const landscape = new Uint8Array(readFileSync('test/fixtures/landscape.jpg'));
const dir = mkdtempSync(join(tmpdir(), 'ordo-layout-'));

function info(bytes: Uint8Array, name: string) {
  const f = join(dir, name);
  writeFileSync(f, bytes);
  const r = spawnSync('python3', ['-c', `
from pypdf import PdfReader
import json
r=PdfReader(${JSON.stringify(f)})
print(json.dumps([[round(float(p.mediabox.width)),round(float(p.mediabox.height))] for p in r.pages]+[[ (r.pages[i].extract_text() or '').strip() for i in range(len(r.pages))]]))`], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout) as any[];
}

describe('PDF layout options', () => {
  it('orientation: auto follows the picture, forced values win', async () => {
    const auto = info(await buildPdf([{ bytes: portrait, format: 'jpg' }, { bytes: landscape, format: 'jpg' }], { pageSize: 'A4' }), 'auto.pdf');
    if (!auto) return;
    expect(auto.slice(0, 2)).toEqual([[595, 842], [842, 595]]);
    const forcedL = info(await buildPdf([{ bytes: portrait, format: 'jpg' }], { pageSize: 'A4', orientation: 'landscape' }), 'l.pdf')!;
    expect(forcedL[0]).toEqual([842, 595]);
    const forcedP = info(await buildPdf([{ bytes: landscape, format: 'jpg' }], { pageSize: 'Letter', orientation: 'portrait' }), 'p.pdf')!;
    expect(forcedP[0]).toEqual([612, 792]);
  });

  it('margin shrinks the picture inside the same page; fit grows the page by the margin', async () => {
    const none = info(await buildPdf([{ bytes: portrait, format: 'jpg' }], { pageSize: 'fit' }), 'f0.pdf');
    if (!none) return;
    const normal = info(await buildPdf([{ bytes: portrait, format: 'jpg' }], { pageSize: 'fit', margin: 'normal' }), 'f1.pdf')!;
    expect(normal[0][1]).toBeGreaterThanOrEqual((none[0] as number[])[1] - 1);
    const a4 = info(await buildPdf([{ bytes: portrait, format: 'jpg' }], { pageSize: 'A4', margin: 'normal' }), 'a4.pdf')!;
    expect(a4[0]).toEqual([595, 842]);
  });

  it('page numbers print n / total and nothing else changes', async () => {
    const r = info(await buildPdf([{ bytes: portrait, format: 'jpg' }, { bytes: portrait, format: 'jpg' }, { bytes: portrait, format: 'jpg' }], { pageSize: 'A4', pageNumbers: true }), 'n.pdf');
    if (!r) return;
    expect(r[3]).toEqual(['1 / 3', '2 / 3', '3 / 3']);
    const off = info(await buildPdf([{ bytes: portrait, format: 'jpg' }], { pageSize: 'A4' }), 'no.pdf')!;
    expect(off[1] as string[]).toEqual(['']);
  });
});
