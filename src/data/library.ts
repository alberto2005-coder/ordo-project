import type { Db } from './db';

export type Filter = 'original' | 'enhanced' | 'bw' | 'gray';
export type ExportQuality = 'low' | 'medium' | 'high';
export type PdfPageSize = 'A4' | 'Letter' | 'fit';

export interface DocumentRow {
  id: string;
  title: string;
  folder_id: string | null;
  locked: number;
  created_at: string;
  updated_at: string;
}
export interface DocumentSummary extends DocumentRow {
  page_count: number;
  thumbnail_path: string | null;
}
export interface PageRow {
  id: string;
  document_id: string;
  position: number;
  original_path: string;
  processed_path: string;
  filter: Filter;
  rotation: number;
}
export interface NewPage {
  originalPath: string;
  processedPath?: string;
}
export interface Settings {
  default_filter: Filter;
  export_quality: ExportQuality;
  pdf_page_size: PdfPageSize;
  theme: 'system' | 'light' | 'dark';
  language: string;
}

/** Local ids. Nothing leaves the phone, so a random v4-style id is enough. */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const iso = (d: Date) => d.toISOString();

export async function createDocument(
  db: Db,
  input: { id?: string; title: string; pages: NewPage[]; folderId?: string | null; now?: Date },
): Promise<string> {
  const id = input.id ?? newId();
  const at = iso(input.now ?? new Date());
  await db.transaction(async () => {
    await db.run(
      'insert into documents (id, title, folder_id, created_at, updated_at) values (?, ?, ?, ?, ?)',
      [id, input.title, input.folderId ?? null, at, at],
    );
    for (let i = 0; i < input.pages.length; i++) {
      const p = input.pages[i];
      await db.run(
        `insert into pages (id, document_id, position, original_path, processed_path, created_at)
         values (?, ?, ?, ?, ?, ?)`,
        [newId(), id, i, p.originalPath, p.processedPath ?? p.originalPath, at],
      );
    }
  });
  return id;
}

/** Escapes % and _ so a search for "50%" matches the text, not everything. */
function likePattern(q: string): string {
  return '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

export async function listDocuments(
  db: Db,
  opts: { query?: string; folderId?: string | null } = {},
): Promise<DocumentSummary[]> {
  const where: string[] = [];
  const params: (string | number | null)[] = [];
  if (opts.folderId === null) where.push('d.folder_id is null');
  else if (opts.folderId) {
    where.push('d.folder_id = ?');
    params.push(opts.folderId);
  }
  const q = opts.query?.trim();
  if (q) {
    where.push("d.title like ? escape '\\'");
    params.push(likePattern(q));
  }
  return db.all<DocumentSummary>(
    `select d.*,
            (select count(*) from pages p where p.document_id = d.id) as page_count,
            (select p.processed_path from pages p where p.document_id = d.id
              order by p.position limit 1) as thumbnail_path
       from documents d
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by d.updated_at desc`,
    params,
  );
}

export async function getDocument(
  db: Db,
  id: string,
): Promise<{ doc: DocumentRow; pages: PageRow[] } | null> {
  const doc = await db.first<DocumentRow>('select * from documents where id = ?', [id]);
  if (!doc) return null;
  const pages = await db.all<PageRow>(
    'select * from pages where document_id = ? order by position',
    [id],
  );
  return { doc, pages };
}

export async function renameDocument(db: Db, id: string, title: string, now = new Date()) {
  const clean = title.trim();
  if (!clean) throw new Error('title is empty');
  await db.run('update documents set title = ?, updated_at = ? where id = ?', [
    clean.slice(0, 200),
    iso(now),
    id,
  ]);
}

/** Deletes the document and returns the image paths so the caller can remove the files. */
export async function deleteDocument(db: Db, id: string): Promise<string[]> {
  const pages = await db.all<{ original_path: string; processed_path: string }>(
    'select original_path, processed_path from pages where document_id = ?',
    [id],
  );
  await db.run('delete from documents where id = ?', [id]);
  const paths = new Set<string>();
  pages.forEach((p) => {
    paths.add(p.original_path);
    paths.add(p.processed_path);
  });
  return [...paths];
}

export async function addPages(db: Db, docId: string, pages: NewPage[], now = new Date()) {
  await db.transaction(async () => {
    const row = await db.first<{ next: number }>(
      'select coalesce(max(position) + 1, 0) as next from pages where document_id = ?',
      [docId],
    );
    let pos = row?.next ?? 0;
    for (const p of pages) {
      await db.run(
        `insert into pages (id, document_id, position, original_path, processed_path, created_at)
         values (?, ?, ?, ?, ?, ?)`,
        [newId(), docId, pos++, p.originalPath, p.processedPath ?? p.originalPath, iso(now)],
      );
    }
    await db.run('update documents set updated_at = ? where id = ?', [iso(now), docId]);
  });
}

/** Moves pages into the given order. Two passes because (document_id, position) is unique. */
export async function reorderPages(db: Db, docId: string, orderedPageIds: string[]) {
  await db.transaction(async () => {
    const existing = await db.all<{ id: string }>(
      'select id from pages where document_id = ?',
      [docId],
    );
    const same =
      existing.length === orderedPageIds.length &&
      existing.every((e) => orderedPageIds.includes(e.id));
    if (!same) throw new Error('page list does not match the document');
    await db.run('update pages set position = position + 1000000 where document_id = ?', [docId]);
    for (let i = 0; i < orderedPageIds.length; i++) {
      await db.run('update pages set position = ? where id = ? and document_id = ?', [
        i,
        orderedPageIds[i],
        docId,
      ]);
    }
  });
}

/** Removes a page, closes the gap in positions, and returns its files to delete. */
export async function deletePage(db: Db, pageId: string): Promise<string[]> {
  return db.transaction(async () => {
    const page = await db.first<PageRow>('select * from pages where id = ?', [pageId]);
    if (!page) return [];
    await db.run('delete from pages where id = ?', [pageId]);
    await db.run(
      'update pages set position = position - 1 where document_id = ? and position > ?',
      [page.document_id, page.position],
    );
    return [...new Set([page.original_path, page.processed_path])];
  });
}

export async function getSettings(db: Db): Promise<Settings> {
  const s = await db.first<Settings>('select * from settings where id = 1');
  if (!s) throw new Error('settings row missing');
  return s;
}

export async function updateSettings(db: Db, patch: Partial<Settings>) {
  const keys = Object.keys(patch) as (keyof Settings)[];
  if (!keys.length) return;
  const allowed = ['default_filter', 'export_quality', 'pdf_page_size', 'theme', 'language'];
  if (keys.some((k) => !allowed.includes(k))) throw new Error('unknown setting');
  await db.run(
    `update settings set ${keys.map((k) => `${k} = ?`).join(', ')} where id = 1`,
    keys.map((k) => patch[k] as string),
  );
}
