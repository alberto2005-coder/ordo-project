import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../src/data/db';
import { createFolder, listFolders, moveDocument } from '../src/data/folders';
import { createDocument, getSettings, listDocuments, updateSettings } from '../src/data/library';
import { setDocumentTags, listTags } from '../src/data/tags';
import { emptyTrash, purgeDocuments, purgeOld, restoreDocuments, trashDocuments } from '../src/data/trash';
import { openTestDb } from './sqljsDb';

let db: Db;
beforeEach(async () => {
  db = await openTestDb();
  await migrate(db);
});
const doc = (title: string, file: string) => createDocument(db, { title, pages: [{ originalPath: file }] });

describe('trash', () => {
  it('hides trashed documents everywhere and restores them', async () => {
    const a = await doc('A', 'a.jpg');
    const b = await doc('B', 'b.jpg');
    const f = await createFolder(db, 'F');
    await moveDocument(db, a, f);
    await setDocumentTags(db, a, ['x']);
    await trashDocuments(db, [a]);
    expect((await listDocuments(db)).map((d) => d.id)).toEqual([b]);
    expect((await listDocuments(db, { trashed: true })).map((d) => d.id)).toEqual([a]);
    expect((await listFolders(db))[0].doc_count).toBe(0);
    expect((await listTags(db))[0].doc_count).toBe(0);
    await restoreDocuments(db, [a]);
    expect((await listDocuments(db)).length).toBe(2);
    expect((await listFolders(db))[0].doc_count).toBe(1);
  });

  it('purge only deletes what is in the trash and returns unused files', async () => {
    const a = await doc('A', 'a.jpg');
    const live = await doc('L', 'l.jpg');
    expect(await purgeDocuments(db, [a])).toEqual([]); // not trashed: untouched
    expect((await listDocuments(db)).length).toBe(2);
    await trashDocuments(db, [a]);
    expect(await purgeDocuments(db, [a, live])).toEqual(['a.jpg']);
    expect((await listDocuments(db)).map((d) => d.id)).toEqual([live]);
  });

  it('keeps files still used by another document (merge shares files)', async () => {
    const a = await doc('A', 'same.jpg');
    const b = await doc('B', 'same.jpg');
    await trashDocuments(db, [a]);
    expect(await emptyTrash(db)).toEqual([]);
    expect((await listDocuments(db)).map((d) => d.id)).toEqual([b]);
  });

  it('purgeOld removes only documents trashed longer than the limit', async () => {
    const old = await doc('Old', 'o.jpg');
    const recent = await doc('Recent', 'r.jpg');
    const now = new Date('2026-10-29T12:00:00Z');
    await trashDocuments(db, [old], new Date('2026-09-01T00:00:00Z'));
    await trashDocuments(db, [recent], new Date('2026-10-20T00:00:00Z'));
    expect(await purgeOld(db, now)).toEqual(['o.jpg']);
    expect((await listDocuments(db, { trashed: true })).map((d) => d.id)).toEqual([recent]);
  });
});

describe('new settings and sort', () => {
  it('has defaults, accepts valid values and rejects invalid ones', async () => {
    const s = await getSettings(db);
    expect([s.pdf_orientation, s.pdf_margin, s.pdf_numbers, s.sort_by, s.view_mode]).toEqual(['auto', 'none', 0, 'date', 'grid']);
    await updateSettings(db, { pdf_margin: 'small', view_mode: 'list', sort_by: 'name' });
    expect((await getSettings(db)).view_mode).toBe('list');
    await expect(updateSettings(db, { pdf_margin: 'huge' as never })).rejects.toThrow();
  });
  it('sorts by name ignoring case', async () => {
    await doc('banana', '1.jpg');
    await doc('Apple', '2.jpg');
    await doc('cherry', '3.jpg');
    expect((await listDocuments(db, { sort: 'name' })).map((d) => d.title)).toEqual(['Apple', 'banana', 'cherry']);
  });
});
