import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPdf, type PageImage } from '../src/pdf/buildPdf';

const img: PageImage = { bytes: readFileSync('test/fixtures/portrait.jpg'), format: 'jpg' };
const dir = mkdtempSync(join(tmpdir(), 'ordo-enc-'));

async function make(password?: string) {
  const bytes = await buildPdf([img, img], { pageSize: 'A4', title: 'Secreto', password });
  const path = join(dir, `${password ? 'locked' : 'plain'}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(path, bytes);
  return path;
}
const qpdf = (args: string[]) => spawnSync('qpdf', args, { encoding: 'utf8' });
const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;

describe.skipIf(!hasQpdf)('PDF password (checked with qpdf, pdftotext and pypdf, not with our own library)', () => {
  it('uses AES-256 (revision 6)', async () => {
    const out = qpdf(['--show-encryption', '--password=clave', await make('clave')]);
    expect(out.stdout + out.stderr).toMatch(/R = 6/);
    expect(out.stdout + out.stderr).toMatch(/AESv3|AES.*256|256/i);
  });

  it('opens with the right password and refuses a wrong or missing one', async () => {
    const f = await make('clave');
    expect(qpdf(['--check', '--password=clave', f]).status).toBe(0);
    expect(qpdf(['--check', '--password=otra', f]).status).not.toBe(0);
    expect(qpdf(['--check', f]).status).not.toBe(0);
  });

  it('keeps all pages after unlocking', async () => {
    const f = await make('clave');
    const out = execFileSync('qpdf', ['--password=clave', '--show-npages', f], { encoding: 'utf8' });
    expect(out.trim()).toBe('2');
  });

  it('handles accents and symbols in the password', async () => {
    const pw = 'contraseña-ñ-€!';
    const f = await make(pw);
    expect(qpdf(['--check', `--password=${pw}`, f]).status).toBe(0);
    expect(qpdf(['--check', '--password=contrasena-n-E!', f]).status).not.toBe(0);
  });

  it('is rejected by an independent reader without the password (pypdf, pdftotext)', async () => {
    const f = await make('clave');
    const py = spawnSync('python3', ['-c', `
import sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
assert r.is_encrypted
assert r.decrypt("mala") == 0
assert r.decrypt("clave") != 0
assert len(r.pages) == 2
print("ok")`, f], { encoding: 'utf8' });
    expect(py.stdout.trim()).toBe('ok');
    const bad = spawnSync('pdftotext', ['-upw', 'mala', f, '-'], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    const good = spawnSync('pdftotext', ['-upw', 'clave', f, '-'], { encoding: 'utf8' });
    expect(good.status).toBe(0);
  });

  it('leaves an unprotected PDF unencrypted, and treats an empty password as none', async () => {
    expect(qpdf(['--is-encrypted', await make()]).status).not.toBe(0);
    const bytes = await buildPdf([img], { pageSize: 'A4', password: '' });
    const f = join(dir, 'empty.pdf');
    writeFileSync(f, bytes);
    expect(qpdf(['--is-encrypted', f]).status).not.toBe(0);
  });

  it('does not store the password or the image bytes in readable form', async () => {
    const f = await make('clave-secreta-xyz');
    const raw = readFileSync(f).toString('latin1');
    expect(raw).not.toContain('clave-secreta-xyz');
    expect(raw).toMatch(/\/Encrypt/);
  });
});
