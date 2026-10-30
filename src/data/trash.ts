import type { Db } from './db';
import { deleteDocument } from './library';

export const TRASH_DAYS = 30;

/** Moves documents to the trash. Nothing is deleted from disk yet. */
export async function trashDocuments(db: Db, ids: string[], now = new Date()) {
  await db.transaction(async () => {
    for (const id of new Set(ids)) await db.run('update documents set deleted_at = ? where id = ? and deleted_at is null', [now.toISOString(), id]);
  });
}

export async function restoreDocuments(db: Db, ids: string[]) {
  await db.transaction(async () => {
    for (const id of new Set(ids)) {
      await db.run('update documents set deleted_at = null where id = ?', [id]);
      // A folder deleted while the document was in the trash no longer exists: the FK already cleared folder_id.
    }
  });
}

/** Deletes trashed documents for good. Returns the image files nobody uses any more. */
export async function purgeDocuments(db: Db, ids: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const id of new Set(ids)) {
    const row = await db.first<{ deleted_at: string | null }>('select deleted_at from documents where id = ?', [id]);
    if (!row || !row.deleted_at) continue; // only what is already in the trash
    files.push(...(await deleteDocument(db, id)));
  }
  return [...new Set(files)];
}

export async function emptyTrash(db: Db): Promise<string[]> {
  const rows = await db.all<{ id: string }>('select id from documents where deleted_at is not null');
  return purgeDocuments(db, rows.map((r) => r.id));
}

/** Removes what has been in the trash longer than `days`. Run when the app starts. */
export async function purgeOld(db: Db, now = new Date(), days = TRASH_DAYS): Promise<string[]> {
  const limit = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = await db.all<{ id: string }>('select id from documents where deleted_at is not null and deleted_at < ?', [limit]);
  return purgeDocuments(db, rows.map((r) => r.id));
}
