import { beforeEach, describe, expect, it } from 'vitest';
import { addAnnotation, deleteSignature, listAnnotations, listSignatures, removeLastAnnotation, saveSignature, validate } from '../src/data/annotations';
import { migrate, type Db } from '../src/data/db';
import { createFolder, deleteFolder, getFolder, listFolders, moveDocument, renameFolder, setDocumentLocked, setFolderLocked } from '../src/data/folders';
import { createDocument, deleteDocument, deletePage, getDocument, listDocuments } from '../src/data/library';
import { mergeDocuments, savePageOcr, splitDocument, updatePageEdit } from '../src/data/pageOps';
import { getDocumentTags, listTags, setDocumentTags } from '../src/data/tags';
import { openTestDb } from './sqljsDb';

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
  await migrate(db);
});
const pg = (tag: string, n: number) => Array.from({ length: n }, (_, i) => ({ originalPath: `file:///${tag}${i}.jpg` }));
const doc = (title: string, tag: string, n = 2) => createDocument(db, { title, pages: pg(tag, n) });

describe('folders', () => {
  it('creates, lists with counts, renames, and rejects empty and duplicate names', async () => {
    const a = await createFolder(db, '  Facturas   2026 ');
    expect((await getFolder(db, a))?.name).toBe('Facturas 2026');
    await expect(createFolder(db, '   ')).rejects.toThrow();
    await expect(createFolder(db, 'facturas 2026')).rejects.toThrow(/exists/);
    const d = await doc('F1', 'f');
    await moveDocument(db, d, a);
    expect((await listFolders(db))[0]).toMatchObject({ name: 'Facturas 2026', doc_count: 1 });
    await renameFolder(db, a, 'Facturas');
    expect((await getFolder(db, a))?.name).toBe('Facturas');
    const b = await createFolder(db, 'Otra');
    await expect(renameFolder(db, b, 'FACTURAS')).rejects.toThrow(/exists/);
  });

  it('allows one level of nesting and no more', async () => {
    const top = await createFolder(db, 'Top');
    const sub = await createFolder(db, 'Sub', top);
    await expect(createFolder(db, 'Deep', sub)).rejects.toThrow(/one level/);
    await expect(createFolder(db, 'X', 'nope')).rejects.toThrow();
    expect((await listFolders(db, top)).map((f) => f.name)).toEqual(['Sub']);
  });

  it('deleting a folder keeps its documents (they return to the top level)', async () => {
    const top = await createFolder(db, 'Top');
    const sub = await createFolder(db, 'Sub', top);
    const d1 = await doc('A', 'a');
    const d2 = await doc('B', 'b');
    await moveDocument(db, d1, top);
    await moveDocument(db, d2, sub);
    await deleteFolder(db, top);
    expect(await listFolders(db)).toHaveLength(0);
    const all = await listDocuments(db, { folderId: null });
    expect(all.map((d) => d.id).sort()).toEqual([d1, d2].sort());
  });

  it('filters by folder and refuses to move into a missing folder', async () => {
    const f = await createFolder(db, 'F');
    const inF = await doc('In', 'i');
    await doc('Out', 'o');
    await moveDocument(db, inF, f);
    expect((await listDocuments(db, { folderId: f })).map((d) => d.id)).toEqual([inF]);
    expect(await listDocuments(db, { folderId: null })).toHaveLength(1);
    await expect(moveDocument(db, inF, 'nope')).rejects.toThrow();
  });

  it('a document in a locked folder reports as locked', async () => {
    const f = await createFolder(db, 'Priv');
    const d = await doc('Secreto', 's');
    const free = await doc('Libre', 'l');
    await moveDocument(db, d, f);
    expect((await listDocuments(db)).find((x) => x.id === d)?.is_locked).toBe(0);
    await setFolderLocked(db, f, true);
    const rows = await listDocuments(db);
    expect(rows.find((x) => x.id === d)?.is_locked).toBe(1);
    expect(rows.find((x) => x.id === free)?.is_locked).toBe(0);
    await setDocumentLocked(db, free, true);
    expect((await listDocuments(db)).find((x) => x.id === free)?.is_locked).toBe(1);
  });
});

describe('tags', () => {
  it('sets, replaces and merges tags case-insensitively, and removes unused ones', async () => {
    const a = await doc('A', 'a');
    const b = await doc('B', 'b');
    await setDocumentTags(db, a, ['Casa', 'casa', ' Trabajo ']);
    expect(await getDocumentTags(db, a)).toEqual(['Casa', 'Trabajo']);
    await setDocumentTags(db, b, ['CASA']);
    expect(await listTags(db)).toHaveLength(2);
    const casa = (await listTags(db)).find((t) => t.name === 'Casa')!;
    expect(casa.doc_count).toBe(2);
    expect((await listDocuments(db, { tagId: casa.id })).map((d) => d.id).sort()).toEqual([a, b].sort());
    await setDocumentTags(db, a, []);
    await setDocumentTags(db, b, []);
    expect(await listTags(db)).toHaveLength(0);
    await expect(setDocumentTags(db, a, ['   '])).rejects.toThrow();
  });
});

describe('OCR text and search', () => {
  it('saves page text, makes the document searchable by it, and clears it when pages go', async () => {
    const id = await doc('Sin titulo', 'o', 2);
    const [p0, p1] = (await getDocument(db, id))!.pages;
    await savePageOcr(db, p0.id, 'Total a pagar: 125,50 EUR', 'es');
    await savePageOcr(db, p1.id, 'Gracias por su compra', 'es');
    expect(await listDocuments(db, { query: 'pagar' })).toHaveLength(1);
    expect(await listDocuments(db, { query: 'compra' })).toHaveLength(1);
    expect(await listDocuments(db, { query: 'zzz' })).toHaveLength(0);
    await deletePage(db, p0.id);
    expect(await listDocuments(db, { query: 'pagar' })).toHaveLength(0);
    expect(await listDocuments(db, { query: 'compra' })).toHaveLength(1);
    await expect(savePageOcr(db, 'nope', 'x', null)).rejects.toThrow();
  });
});

describe('page edit', () => {
  it('never offers the original photo for deletion, but does offer a replaced rendered file', async () => {
    const id = await doc('E', 'e', 1);
    const page = (await getDocument(db, id))!.pages[0];
    // First edit: the rendered file was the original itself, which must be kept.
    expect(await updatePageEdit(db, page.id, { filter: 'bw', rotation: 90, brightness: 0.2, contrast: -0.1 }, 'file:///e0-v1.jpg')).toEqual([]);
    let now = (await getDocument(db, id))!.pages[0];
    expect(now).toMatchObject({ filter: 'bw', rotation: 90, processed_path: 'file:///e0-v1.jpg', original_path: 'file:///e0.jpg' });
    expect(now.brightness).toBeCloseTo(0.2);
    // Second edit replaces v1, which nothing else uses, so it can be deleted.
    expect(await updatePageEdit(db, page.id, { filter: 'gray', rotation: 0, brightness: 0, contrast: 0 }, 'file:///e0-v2.jpg')).toEqual(['file:///e0-v1.jpg']);
    // Saving again with the same rendered file frees nothing.
    expect(await updatePageEdit(db, page.id, { filter: 'gray', rotation: 0, brightness: 0, contrast: 0 }, 'file:///e0-v2.jpg')).toEqual([]);
    now = (await getDocument(db, id))!.pages[0];
    expect(now.filter).toBe('gray');
    await expect(updatePageEdit(db, 'nope', { filter: 'bw', rotation: 0, brightness: 0, contrast: 0 }, 'x')).rejects.toThrow();
  });
});

describe('merge and split', () => {
  it('merges documents in order, shares the files, and only frees a file when nothing uses it', async () => {
    const a = await doc('A', 'a', 2);
    const b = await doc('B', 'b', 1);
    const m = await mergeDocuments(db, [a, b], 'Juntos');
    const got = await getDocument(db, m);
    expect(got!.pages.map((p) => p.original_path)).toEqual(['file:///a0.jpg', 'file:///a1.jpg', 'file:///b0.jpg']);
    expect(got!.pages.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(await deleteDocument(db, a)).toEqual([]); // the merged copy still uses a0 and a1
    expect((await getDocument(db, m))!.pages).toHaveLength(3);
    // Deleting the merged one frees a0 and a1, but b0 is still used by B.
    expect((await deleteDocument(db, m)).sort()).toEqual(['file:///a0.jpg', 'file:///a1.jpg']);
    expect(await deleteDocument(db, b)).toEqual(['file:///b0.jpg']);
  });

  it('can delete the sources after merging, carries OCR text and annotations over', async () => {
    const a = await doc('A', 'a', 1);
    const b = await doc('B', 'b', 1);
    const pa = (await getDocument(db, a))!.pages[0];
    await savePageOcr(db, pa.id, 'hola mundo', 'es');
    await addAnnotation(db, pa.id, { kind: 'draw', color: '#ff0000', width: 0.01, points: [[0.1, 0.1], [0.2, 0.2]] });
    const m = await mergeDocuments(db, [a, b], 'AB', { deleteSources: true });
    expect(await getDocument(db, a)).toBeNull();
    expect(await listDocuments(db, { query: 'mundo' })).toHaveLength(1);
    const first = (await getDocument(db, m))!.pages[0];
    expect(await listAnnotations(db, first.id)).toHaveLength(1);
    expect((await getDocument(db, m))!.pages).toHaveLength(2);
  });

  it('refuses to merge fewer than two documents, an empty title, or a missing document', async () => {
    const a = await doc('A', 'a');
    await expect(mergeDocuments(db, [a], 'X')).rejects.toThrow();
    await expect(mergeDocuments(db, [a, a], 'X')).rejects.toThrow();
    const b = await doc('B', 'b');
    await expect(mergeDocuments(db, [a, b], '  ')).rejects.toThrow();
    await expect(mergeDocuments(db, [a, 'nope'], 'X')).rejects.toThrow();
    expect(await listDocuments(db)).toHaveLength(2); // nothing half-created
  });

  it('splits chosen pages into a new document and renumbers both', async () => {
    const a = await doc('Grande', 'g', 4);
    const ids = (await getDocument(db, a))!.pages.map((p) => p.id);
    const n = await splitDocument(db, a, [ids[1], ids[3]], 'Parte 2');
    const rest = await getDocument(db, a);
    const moved = await getDocument(db, n);
    expect(rest!.pages.map((p) => p.id)).toEqual([ids[0], ids[2]]);
    expect(rest!.pages.map((p) => p.position)).toEqual([0, 1]);
    expect(moved!.pages.map((p) => p.id)).toEqual([ids[1], ids[3]]);
    expect(moved!.pages.map((p) => p.position)).toEqual([0, 1]);
  });

  it('refuses a split that would empty the original or use foreign pages, leaving things untouched', async () => {
    const a = await doc('A', 'a', 2);
    const b = await doc('B', 'b', 1);
    const ids = (await getDocument(db, a))!.pages.map((p) => p.id);
    const foreign = (await getDocument(db, b))!.pages[0].id;
    await expect(splitDocument(db, a, ids, 'Todo')).rejects.toThrow(/stay/);
    await expect(splitDocument(db, a, [foreign], 'Ajeno')).rejects.toThrow();
    await expect(splitDocument(db, a, [], 'Nada')).rejects.toThrow();
    expect((await getDocument(db, a))!.pages).toHaveLength(2);
    expect(await listDocuments(db)).toHaveLength(2);
  });
});

describe('annotations', () => {
  const stroke = { kind: 'draw' as const, color: '#112233', width: 0.01, points: [[0.1, 0.1], [0.5, 0.5]] as [number, number][] };

  it('stores, lists in order, and undoes the latest', async () => {
    const id = await doc('N', 'n', 1);
    const pageId = (await getDocument(db, id))!.pages[0].id;
    await addAnnotation(db, pageId, stroke, new Date('2026-01-01T00:00:00Z'));
    await addAnnotation(db, pageId, { kind: 'text', x: 0.2, y: 0.3, text: 'Hola ñ', size: 0.04, color: '#000000' }, new Date('2026-01-01T00:00:01Z'));
    expect((await listAnnotations(db, pageId)).map((a) => a.data.kind)).toEqual(['draw', 'text']);
    expect(await removeLastAnnotation(db, pageId)).toBe(true);
    expect((await listAnnotations(db, pageId)).map((a) => a.data.kind)).toEqual(['draw']);
    expect(await removeLastAnnotation(db, pageId)).toBe(true);
    expect(await removeLastAnnotation(db, pageId)).toBe(false);
  });

  it('rejects malformed annotations and skips damaged rows when reading', async () => {
    const id = await doc('N', 'n', 1);
    const pageId = (await getDocument(db, id))!.pages[0].id;
    expect(() => validate({ kind: 'draw', color: 'red', width: 0.01, points: [[0, 0]] })).toThrow();
    expect(() => validate({ kind: 'draw', color: '#000000', width: 5, points: [[0, 0]] })).toThrow();
    expect(() => validate({ kind: 'draw', color: '#000000', width: 0.01, points: [] })).toThrow();
    expect(() => validate({ kind: 'draw', color: '#000000', width: 0.01, points: [[NaN, 0]] })).toThrow();
    expect(() => validate({ kind: 'text', x: 0, y: 0, text: '   ', size: 0.04, color: '#000000' })).toThrow();
    expect(() => validate({ kind: 'nope' })).toThrow();
    expect(() => validate(null)).toThrow();
    await expect(addAnnotation(db, 'no-page', stroke)).rejects.toThrow();
    await addAnnotation(db, pageId, stroke);
    await db.run("insert into annotations (id, page_id, kind, data, created_at) values ('bad', ?, 'draw', '{not json', 't')", [pageId]);
    expect(await listAnnotations(db, pageId)).toHaveLength(1);
  });

  it('keeps reusable signatures and deletes them', async () => {
    const strokes: [number, number][][] = [[[0, 0.5], [0.5, 0.2], [1, 0.6]]];
    const s = await saveSignature(db, strokes);
    expect((await listSignatures(db))[0]).toMatchObject({ id: s, strokes });
    await expect(saveSignature(db, [])).rejects.toThrow();
    await deleteSignature(db, s);
    expect(await listSignatures(db)).toHaveLength(0);
  });
});
