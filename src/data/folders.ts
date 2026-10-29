import type { Db } from './db';
import { newId } from './library';

export interface FolderSummary {
  id: string;
  name: string;
  parent_id: string | null;
  locked: number;
  doc_count: number;
}

const MAX_NAME = 120;

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new Error('name is empty');
  return n.slice(0, MAX_NAME);
}

/** Folders go one level deep: a folder can sit at the top or inside a top-level folder. */
export async function createFolder(db: Db, name: string, parentId: string | null = null, now = new Date()) {
  const clean = cleanName(name);
  if (parentId) {
    const parent = await db.first<{ parent_id: string | null }>('select parent_id from folders where id = ?', [parentId]);
    if (!parent) throw new Error('parent folder not found');
    if (parent.parent_id) throw new Error('folders can only be one level deep');
  }
  const dup = await db.first<{ id: string }>(
    'select id from folders where parent_id is ? and lower(name) = lower(?)',
    [parentId, clean],
  );
  if (dup) throw new Error('a folder with that name already exists');
  const id = newId();
  const at = now.toISOString();
  await db.run('insert into folders (id, name, parent_id, created_at, updated_at) values (?, ?, ?, ?, ?)', [id, clean, parentId, at, at]);
  return id;
}

export async function renameFolder(db: Db, id: string, name: string, now = new Date()) {
  const clean = cleanName(name);
  const row = await db.first<{ parent_id: string | null }>('select parent_id from folders where id = ?', [id]);
  if (!row) throw new Error('folder not found');
  const dup = await db.first<{ id: string }>(
    'select id from folders where parent_id is ? and lower(name) = lower(?) and id <> ?',
    [row.parent_id, clean, id],
  );
  if (dup) throw new Error('a folder with that name already exists');
  await db.run('update folders set name = ?, updated_at = ? where id = ?', [clean, now.toISOString(), id]);
}

/** Deleting a folder never deletes documents: they go back to the top level. */
export async function deleteFolder(db: Db, id: string) {
  await db.transaction(async () => {
    const kids = await db.all<{ id: string }>('select id from folders where parent_id = ?', [id]);
    for (const k of [{ id }, ...kids]) {
      await db.run('update documents set folder_id = null where folder_id = ?', [k.id]);
    }
    await db.run('delete from folders where id = ?', [id]);
  });
}

export async function listFolders(db: Db, parentId: string | null = null): Promise<FolderSummary[]> {
  return db.all<FolderSummary>(
    `select f.id, f.name, f.parent_id, f.locked,
            (select count(*) from documents d where d.folder_id = f.id) as doc_count
       from folders f
      where f.parent_id is ?
      order by lower(f.name)`,
    [parentId],
  );
}

export async function getFolder(db: Db, id: string): Promise<FolderSummary | null> {
  return db.first<FolderSummary>(
    `select f.id, f.name, f.parent_id, f.locked,
            (select count(*) from documents d where d.folder_id = f.id) as doc_count
       from folders f where f.id = ?`,
    [id],
  );
}

export async function moveDocument(db: Db, docId: string, folderId: string | null, now = new Date()) {
  if (folderId) {
    const f = await db.first<{ id: string }>('select id from folders where id = ?', [folderId]);
    if (!f) throw new Error('folder not found');
  }
  await db.run('update documents set folder_id = ?, updated_at = ? where id = ?', [folderId, now.toISOString(), docId]);
}

export async function setFolderLocked(db: Db, id: string, locked: boolean) {
  await db.run('update folders set locked = ? where id = ?', [locked ? 1 : 0, id]);
}
export async function setDocumentLocked(db: Db, id: string, locked: boolean) {
  await db.run('update documents set locked = ? where id = ?', [locked ? 1 : 0, id]);
}
