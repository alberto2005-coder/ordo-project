import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../src/data/db';
import {
  addPages,
  createDocument,
  deleteDocument,
  deletePage,
  getDocument,
  getSettings,
  listDocuments,
  renameDocument,
  reorderPages,
  updateSettings,
} from '../src/data/library';
import { setDocumentLocked } from '../src/data/folders';
import { openTestDb } from './sqljsDb';

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
  await migrate(db);
});

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ originalPath: `file:///d/p${i}.jpg` }));

describe('migrate', () => {
  it('turns foreign keys on, so deleting a document removes its pages', async () => {
    const fk = await db.first<{ foreign_keys: number }>('pragma foreign_keys');
    expect(fk?.foreign_keys).toBe(1);
  });

  it('creates the tables, sets the version, and is safe to run twice', async () => {
    await migrate(db);
    const v = await db.first<{ user_version: number }>('pragma user_version');
    expect(v?.user_version).toBe(4);
    const tables = await db.all<{ name: string }>(
      "select name from sqlite_master where type = 'table' order by name",
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['documents', 'pages', 'folders', 'settings', 'annotations']),
    );
  });
});

describe('documents', () => {
  it('creates a document with ordered pages and lists it with count and thumbnail', async () => {
    const id = await createDocument(db, { title: 'Factura', pages: pages(3) });
    const list = await listDocuments(db);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].page_count).toBe(3);
    expect(list[0].thumbnail_path).toBe('file:///d/p0.jpg');
    const got = await getDocument(db, id);
    expect(got?.pages.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it('lists the most recently updated first', async () => {
    const a = await createDocument(db, { title: 'A', pages: pages(1), now: new Date('2026-01-01') });
    const b = await createDocument(db, { title: 'B', pages: pages(1), now: new Date('2026-02-01') });
    expect((await listDocuments(db)).map((d) => d.id)).toEqual([b, a]);
    await renameDocument(db, a, 'A2', new Date('2026-03-01'));
    expect((await listDocuments(db)).map((d) => d.id)).toEqual([a, b]);
  });

  it('searches titles and treats % and _ as plain text', async () => {
    await createDocument(db, { title: 'Recibo 50% luz', pages: pages(1) });
    await createDocument(db, { title: 'Contrato', pages: pages(1) });
    expect(await listDocuments(db, { query: 'recibo' })).toHaveLength(1);
    expect(await listDocuments(db, { query: '50%' })).toHaveLength(1);
    expect(await listDocuments(db, { query: '%' })).toHaveLength(1);
    expect(await listDocuments(db, { query: '_' })).toHaveLength(0);
  });

  it('hides the thumbnail and the recognized text of locked documents', async () => {
    const id = await createDocument(db, { title: 'Secreto', pages: pages(1) });
    await db.run('update pages set ocr_text = ? where document_id = ?', ['pasaporte', id]);
    await db.run('update documents set ocr_text = ? where id = ?', ['pasaporte', id]);
    await setDocumentLocked(db, id, true);

    const [row] = await listDocuments(db);
    expect(row.thumbnail_path).toBeNull();
    expect(await listDocuments(db, { query: 'pasaporte' })).toHaveLength(0);
    // The title is still searchable, which is what the person sees without unlocking.
    expect(await listDocuments(db, { query: 'secreto' })).toHaveLength(1);
  });

  it('rejects an empty name and trims long ones', async () => {
    const id = await createDocument(db, { title: 'X', pages: pages(1) });
    await expect(renameDocument(db, id, '   ')).rejects.toThrow();
    await renameDocument(db, id, 'y'.repeat(300));
    expect((await getDocument(db, id))?.doc.title).toHaveLength(200);
  });

  it('rolls back a document if a page cannot be saved', async () => {
    await expect(
      createDocument(db, {
        title: 'Roto',
        pages: [{ originalPath: 'a' }, { originalPath: null as unknown as string }],
      }),
    ).rejects.toThrow();
    expect(await listDocuments(db)).toHaveLength(0);
  });

  it('deletes a document with its pages and returns each file once', async () => {
    const id = await createDocument(db, { title: 'Borrar', pages: pages(2) });
    const files = await deleteDocument(db, id);
    expect(files.sort()).toEqual(['file:///d/p0.jpg', 'file:///d/p1.jpg']);
    expect(await getDocument(db, id)).toBeNull();
    const left = await db.first<{ n: number }>('select count(*) as n from pages');
    expect(left?.n).toBe(0);
  });
});

describe('pages', () => {
  it('reorders pages, including swapping two', async () => {
    const id = await createDocument(db, { title: 'R', pages: pages(3) });
    const [p0, p1, p2] = (await getDocument(db, id))!.pages.map((p) => p.id);
    await reorderPages(db, id, [p2, p0, p1]);
    expect((await getDocument(db, id))!.pages.map((p) => p.id)).toEqual([p2, p0, p1]);
  });

  it('refuses a reorder that does not match the document', async () => {
    const id = await createDocument(db, { title: 'R', pages: pages(2) });
    const [p0] = (await getDocument(db, id))!.pages.map((p) => p.id);
    await expect(reorderPages(db, id, [p0])).rejects.toThrow();
    await expect(reorderPages(db, id, [p0, 'nope'])).rejects.toThrow();
  });

  it('closes the gap after deleting a page', async () => {
    const id = await createDocument(db, { title: 'D', pages: pages(3) });
    const middle = (await getDocument(db, id))!.pages[1];
    const files = await deletePage(db, middle.id);
    expect(files).toEqual(['file:///d/p1.jpg']);
    expect((await getDocument(db, id))!.pages.map((p) => p.position)).toEqual([0, 1]);
  });

  it('keeps the filter a page was created with (imported photos)', async () => {
    const id = await createDocument(db, { title: 'F', pages: [{ originalPath: 'o.jpg', processedPath: 'p.jpg', filter: 'bw' }, { originalPath: 'o2.jpg' }] });
    await addPages(db, id, [{ originalPath: 'o3.jpg', processedPath: 'p3.jpg', filter: 'gray' }]);
    const got = await getDocument(db, id);
    expect(got!.pages.map((p) => p.filter)).toEqual(['bw', 'original', 'gray']);
    expect(got!.pages[0].processed_path).toBe('p.jpg');
  });

  it('appends pages at the end', async () => {
    const id = await createDocument(db, { title: 'A', pages: pages(2) });
    await addPages(db, id, [{ originalPath: 'file:///d/new.jpg' }]);
    const got = await getDocument(db, id);
    expect(got!.pages.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(got!.pages[2].original_path).toBe('file:///d/new.jpg');
  });
});

describe('settings', () => {
  it('has defaults and accepts known changes only', async () => {
    const s = await getSettings(db);
    expect(s).toMatchObject({ default_filter: 'enhanced', export_quality: 'medium', pdf_page_size: 'A4' });
    await updateSettings(db, { export_quality: 'high', pdf_page_size: 'Letter' });
    expect(await getSettings(db)).toMatchObject({ export_quality: 'high', pdf_page_size: 'Letter' });
    await expect(updateSettings(db, { export_quality: 'ultra' as never })).rejects.toThrow();
    await expect(updateSettings(db, { id: 2 } as never)).rejects.toThrow();
  });
});
