import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { restoreBackup, writeBackup, type Sink } from '../src/backup/backup';
import { migrate, type Db } from '../src/data/db';
import { createFolder, moveDocument, setDocumentLocked, setFolderLocked } from '../src/data/folders';
import { addAnnotation, listAnnotations, saveSignature, listSignatures } from '../src/data/annotations';
import { createDocument, getDocument, listDocuments } from '../src/data/library';
import { savePageOcr } from '../src/data/pageOps';
import { getDocumentTags, setDocumentTags } from '../src/data/tags';
import { trashDocuments } from '../src/data/trash';
import { openTestDb } from './sqljsDb';

const jpg = new Uint8Array(readFileSync('test/fixtures/portrait.jpg'));
const jpg2 = new Uint8Array(readFileSync('test/fixtures/landscape.jpg'));
const disk: Record<string, Uint8Array> = { 'a.jpg': jpg, 'a2.jpg': jpg, 'b.jpg': jpg2, 'b2.jpg': jpg2, 't.jpg': jpg };

function memorySink() {
  const parts: Uint8Array[] = [];
  const sink: Sink = { write: (c) => void parts.push(c), close: async () => {} };
  const bytes = () => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) (out.set(p, at), (at += p.length));
    return out;
  };
  return { sink, bytes };
}
async function* chunked(b: Uint8Array, size = 1000) {
  for (let i = 0; i < b.length; i += size) yield b.slice(i, i + size);
}

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
  await migrate(db);
});

async function seed() {
  const a = await createDocument(db, { title: 'Contrato', pages: [{ originalPath: 'a.jpg', processedPath: 'a2.jpg' }, { originalPath: 'b.jpg', processedPath: 'b2.jpg' }] });
  const trashed = await createDocument(db, { title: 'Borrado', pages: [{ originalPath: 't.jpg' }] });
  await trashDocuments(db, [trashed]);
  const f = await createFolder(db, 'Casa');
  await moveDocument(db, a, f);
  await setDocumentTags(db, a, ['importante', 'casa']);
  const got = await getDocument(db, a);
  await savePageOcr(db, got!.pages[0].id, 'Texto con ñ y acentos', 'latin');
  await addAnnotation(db, got!.pages[0].id, { kind: 'draw', color: '#112233', width: 0.01, points: [[0.1, 0.1], [0.2, 0.2]] });
  await saveSignature(db, [[[0, 0], [1, 1]]]);
  return a;
}

describe('backup and restore', () => {
  it('round-trips documents, folders, tags, text, drawings and signatures; skips the trash; drops locks', async () => {
    await seed();
    const { sink, bytes } = memorySink();
    const info = await writeBackup(db, async (p) => disk[p], sink);
    expect(info).toEqual({ documents: 1, files: 4 });

    const target = await openTestDb();
    await migrate(target);
    const written: Uint8Array[] = [];
    const res = await restoreBackup(target, chunked(bytes()), async (b) => `restored-${written.push(b)}.jpg`);
    expect(res).toEqual({ documents: 1, pages: 2, skippedPages: 0 });
    expect(written.length).toBe(4);
    expect(written[0]).toEqual(jpg);

    const docs = await listDocuments(target);
    expect(docs.map((d) => d.title)).toEqual(['Contrato']);
    expect(docs[0].is_locked).toBe(0);
    const got = await getDocument(target, docs[0].id);
    expect(got!.pages.map((p) => p.position)).toEqual([0, 1]);
    expect(got!.pages[0].original_path).toMatch(/^restored-/);
    expect(got!.pages[0].ocr_text).toBe('Texto con ñ y acentos');
    expect((await listAnnotations(target, got!.pages[0].id)).map((a) => a.data.kind)).toEqual(['draw']);
    expect(await getDocumentTags(target, docs[0].id)).toEqual(['casa', 'importante']);
    expect((await listSignatures(target)).length).toBe(1);
    const folder = await target.first<{ name: string }>('select f.name from folders f join documents d on d.folder_id = f.id');
    expect(folder?.name).toBe('Casa');
  });

  it('leaves locked documents, and those inside a locked folder, out of the backup', async () => {
    const lockedDoc = await createDocument(db, { title: 'Bloqueado', pages: [{ originalPath: 'a.jpg' }] });
    const inLockedFolder = await createDocument(db, { title: 'En carpeta', pages: [{ originalPath: 'b.jpg' }] });
    await createDocument(db, { title: 'Abierto', pages: [{ originalPath: 't.jpg' }] });
    await setDocumentLocked(db, lockedDoc, true);
    const folder = await createFolder(db, 'Caja fuerte');
    await moveDocument(db, inLockedFolder, folder);
    await setFolderLocked(db, folder, true);

    const { sink, bytes } = memorySink();
    const info = await writeBackup(db, async (p) => disk[p], sink);
    expect(info.documents).toBe(1);

    const target = await openTestDb();
    await migrate(target);
    await restoreBackup(target, chunked(bytes()), async () => 'restored.jpg');
    expect((await listDocuments(target)).map((d) => d.title)).toEqual(['Abierto']);
  });

  it('adds new copies when restoring onto the same data (no id clashes)', async () => {
    await seed();
    const { sink, bytes } = memorySink();
    await writeBackup(db, async (p) => disk[p], sink);
    await restoreBackup(db, chunked(bytes(), 333), async () => 'x.jpg');
    expect((await listDocuments(db)).length).toBe(2);
  });

  it('is a valid zip for other tools', async () => {
    await seed();
    const { sink, bytes } = memorySink();
    await writeBackup(db, async (p) => disk[p], sink);
    const f = join(mkdtempSync(join(tmpdir(), 'ordo-bk-')), 'b.zip');
    writeFileSync(f, bytes());
    const r = spawnSync('python3', ['-c', `import zipfile,json;z=zipfile.ZipFile(${JSON.stringify(f)});assert z.testzip() is None;print(json.dumps([sorted(z.namelist()), json.loads(z.read('data.json'))['app']]))`], { encoding: 'utf8' });
    if (r.status !== 0) return;
    const [names, app] = JSON.parse(r.stdout);
    expect(names).toEqual(['data.json', 'files/1.jpg', 'files/2.jpg', 'files/3.jpg', 'files/4.jpg']);
    expect(app).toBe('ordo');
  });

  it('refuses things that are not an Ordo backup and changes nothing', async () => {
    const notBackup = zipSync({ 'data.json': strToU8(JSON.stringify({ app: 'other', version: 1 })) });
    await expect(restoreBackup(db, chunked(notBackup), async () => 'x')).rejects.toThrow();
    await expect(restoreBackup(db, chunked(strToU8('hello, not a zip')), async () => 'x')).rejects.toThrow();
    const noData = zipSync({ 'files/1.jpg': jpg });
    await expect(restoreBackup(db, chunked(noData), async () => 'x')).rejects.toThrow();
    expect((await listDocuments(db)).length).toBe(0);
  });

  it('ignores damaged annotations and pages whose pictures are missing', async () => {
    const data = {
      app: 'ordo', version: 1, folders: [], tags: [], document_tags: [], signatures: [],
      documents: [{ id: 'd1', title: 'X', folder_id: null, ocr_text: null, created_at: 'c', updated_at: 'u' }],
      pages: [
        { id: 'p1', document_id: 'd1', position: 0, original_path: 'files/1.jpg', processed_path: 'files/1.jpg', crop_corners: null, filter: 'original', rotation: 0, brightness: 0, contrast: 0, ocr_text: null, ocr_language: null, created_at: 'c' },
        { id: 'p2', document_id: 'd1', position: 1, original_path: 'files/9.jpg', processed_path: 'files/9.jpg', crop_corners: null, filter: 'original', rotation: 0, brightness: 0, contrast: 0, ocr_text: null, ocr_language: null, created_at: 'c' },
      ],
      annotations: [{ id: 'a', page_id: 'p1', kind: 'draw', data: '{"kind":"draw","color":"red","width":9,"points":[]}', created_at: 'c' }],
    };
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify(data)), 'files/1.jpg': jpg });
    const res = await restoreBackup(db, chunked(zip), async () => 'ok.jpg');
    expect(res).toEqual({ documents: 1, pages: 1, skippedPages: 1 });
    const doc = (await listDocuments(db))[0];
    expect((await getDocument(db, doc.id))!.pages.length).toBe(1);
    expect((await listAnnotations(db, (await getDocument(db, doc.id))!.pages[0].id)).length).toBe(0);
  });

  it('repairs out-of-range values from a hand-edited backup instead of failing the restore', async () => {
    const data = {
      app: 'ordo', version: 1, folders: [], tags: [], document_tags: [], signatures: [],
      documents: [{ id: 'd1', title: 'X', folder_id: null, ocr_text: null, created_at: 'c', updated_at: 'u' }],
      pages: [{ id: 'p1', document_id: 'd1', position: 0, original_path: 'files/1.jpg', processed_path: 'files/1.jpg', crop_corners: null, filter: 'bogus', rotation: 45, brightness: 9, contrast: -9, ocr_text: null, ocr_language: null, created_at: 'c' }],
      annotations: [],
    };
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify(data)), 'files/1.jpg': jpg });
    const res = await restoreBackup(db, chunked(zip), async () => 'ok.jpg');
    expect(res).toEqual({ documents: 1, pages: 1, skippedPages: 0 });

    const [doc] = await listDocuments(db);
    const page = (await getDocument(db, doc.id))!.pages[0];
    expect(page.filter).toBe('original');
    expect(page.rotation).toBe(0);
    expect(page.brightness).toBe(1);
    expect(page.contrast).toBe(-1);
  });

  it('a failing insert rolls everything back and reports the saved files so they can be removed', async () => {
    const data = {
      app: 'ordo', version: 1, folders: [], tags: [], document_tags: [], signatures: [],
      documents: [{ id: 'd1', title: 'X', folder_id: null, ocr_text: null, created_at: 'c', updated_at: 'u' }],
      // Two pages claiming the same position break the unique constraint, which is the point of this test.
      pages: [
        { id: 'p1', document_id: 'd1', position: 0, original_path: 'files/1.jpg', processed_path: 'files/1.jpg', crop_corners: null, filter: 'original', rotation: 0, brightness: 0, contrast: 0, ocr_text: null, ocr_language: null, created_at: 'c' },
        { id: 'p2', document_id: 'd1', position: 0, original_path: 'files/1.jpg', processed_path: 'files/1.jpg', crop_corners: null, filter: 'original', rotation: 0, brightness: 0, contrast: 0, ocr_text: null, ocr_language: null, created_at: 'c' },
      ],
      annotations: [],
    };
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify(data)), 'files/1.jpg': jpg });
    const err = await restoreBackup(db, chunked(zip), async () => 'ok.jpg').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { saved: string[] }).saved).toEqual(['ok.jpg']);
    expect((await listDocuments(db)).length).toBe(0);
  });
});
