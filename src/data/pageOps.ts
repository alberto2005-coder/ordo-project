import type { Db } from './db';
import { isFullPage, type Corners } from '../image/warp';
import { newId, refreshDocumentText, unreferenced, type Filter } from './library';

export interface PageEdit {
  filter: Filter;
  rotation: 0 | 90 | 180 | 270;
  brightness: number;
  contrast: number;
  /** Four page corners inside the original, or null for the whole picture. */
  crop?: Corners | null;
}

/** Saves a page's edit and its new rendered file. Returns the old rendered file if it can be deleted. */
export async function updatePageEdit(db: Db, pageId: string, edit: PageEdit, processedPath: string, now = new Date()): Promise<string[]> {
  return db.transaction(async () => {
    const page = await db.first<{ document_id: string; processed_path: string }>(
      'select document_id, processed_path from pages where id = ?',
      [pageId],
    );
    if (!page) throw new Error('page not found');
    await db.run(
      'update pages set filter = ?, rotation = ?, brightness = ?, contrast = ?, crop_corners = ?, processed_path = ? where id = ?',
      [edit.filter, edit.rotation, edit.brightness, edit.contrast, edit.crop && !isFullPage(edit.crop) ? JSON.stringify(edit.crop) : null, processedPath, pageId],
    );
    await db.run('update documents set updated_at = ? where id = ?', [now.toISOString(), page.document_id]);
    return page.processed_path === processedPath ? [] : unreferenced(db, [page.processed_path]);
  });
}

export async function savePageOcr(db: Db, pageId: string, text: string, language: string | null) {
  const page = await db.first<{ document_id: string }>('select document_id from pages where id = ?', [pageId]);
  if (!page) throw new Error('page not found');
  await db.run('update pages set ocr_text = ?, ocr_language = ? where id = ?', [text, language, pageId]);
  await refreshDocumentText(db, page.document_id);
}

/** Joins documents into a new one, in the order given. The files are shared, not copied. */
export async function mergeDocuments(
  db: Db,
  docIds: string[],
  title: string,
  opts: { deleteSources?: boolean; now?: Date } = {},
): Promise<string> {
  const ids = [...new Set(docIds)];
  if (ids.length < 2) throw new Error('need at least two documents');
  const clean = title.trim().slice(0, 200);
  if (!clean) throw new Error('title is empty');
  const at = (opts.now ?? new Date()).toISOString();
  const newDoc = newId();
  await db.transaction(async () => {
    const first = await db.first<{ folder_id: string | null }>('select folder_id from documents where id = ?', [ids[0]]);
    if (!first) throw new Error('document not found');
    await db.run('insert into documents (id, title, folder_id, created_at, updated_at) values (?, ?, ?, ?, ?)', [newDoc, clean, first.folder_id, at, at]);
    let pos = 0;
    for (const id of ids) {
      const pages = await db.all<{ id: string; original_path: string; processed_path: string; crop_corners: string | null; filter: string; rotation: number; brightness: number; contrast: number; ocr_text: string | null; ocr_language: string | null }>(
        'select * from pages where document_id = ? order by position',
        [id],
      );
      if (!pages.length && !(await db.first('select id from documents where id = ?', [id]))) throw new Error('document not found');
      for (const p of pages) {
        const pid = newId();
        await db.run(
          `insert into pages (id, document_id, position, original_path, processed_path, crop_corners, filter, rotation, brightness, contrast, ocr_text, ocr_language, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pid, newDoc, pos++, p.original_path, p.processed_path, p.crop_corners, p.filter, p.rotation, p.brightness, p.contrast, p.ocr_text, p.ocr_language, at],
        );
        await db.run(
          `insert into annotations (id, page_id, kind, data, created_at)
           select ?||'-'||substr(id, 1, 8)||'-'||rowid, ?, kind, data, created_at from annotations where page_id = ?`,
          [pid, pid, p.id],
        );
      }
    }
    await refreshDocumentText(db, newDoc);
    if (opts.deleteSources) for (const id of ids) await db.run('delete from documents where id = ?', [id]);
  });
  return newDoc;
}

/** Moves the chosen pages into a new document. At least one page must stay behind. */
export async function splitDocument(db: Db, docId: string, pageIds: string[], title: string, now = new Date()): Promise<string> {
  const chosen = [...new Set(pageIds)];
  const clean = title.trim().slice(0, 200);
  if (!clean) throw new Error('title is empty');
  if (!chosen.length) throw new Error('no pages chosen');
  const at = now.toISOString();
  const newDoc = newId();
  await db.transaction(async () => {
    const doc = await db.first<{ folder_id: string | null }>('select folder_id from documents where id = ?', [docId]);
    if (!doc) throw new Error('document not found');
    const all = await db.all<{ id: string }>('select id from pages where document_id = ? order by position', [docId]);
    const allIds = all.map((p) => p.id);
    if (!chosen.every((c) => allIds.includes(c))) throw new Error('page does not belong to the document');
    if (chosen.length >= allIds.length) throw new Error('at least one page must stay in the original');
    const moving = allIds.filter((i) => chosen.includes(i));
    const staying = allIds.filter((i) => !chosen.includes(i));
    await db.run('insert into documents (id, title, folder_id, created_at, updated_at) values (?, ?, ?, ?, ?)', [newDoc, clean, doc.folder_id, at, at]);
    await db.run('update pages set position = position + 1000000 where document_id = ?', [docId]);
    for (let i = 0; i < moving.length; i++) {
      await db.run('update pages set document_id = ?, position = ? where id = ?', [newDoc, i, moving[i]]);
    }
    for (let i = 0; i < staying.length; i++) {
      await db.run('update pages set position = ? where id = ?', [i, staying[i]]);
    }
    await db.run('update documents set updated_at = ? where id = ?', [at, docId]);
    await refreshDocumentText(db, docId);
    await refreshDocumentText(db, newDoc);
  });
  return newDoc;
}
