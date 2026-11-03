import { strFromU8, strToU8, Unzip, UnzipInflate, UnzipPassThrough, Zip, ZipPassThrough } from 'fflate';
import { validate } from '../data/annotations';
import type { Db } from '../data/db';
import { newId } from '../data/library';

export const BACKUP_VERSION = 1;
const MAX_DATA_BYTES = 64 * 1024 * 1024;
/** A backup is unpacked one picture at a time; these caps stop a small file from filling the phone. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

interface Folder { id: string; name: string; parent_id: string | null; created_at: string; updated_at: string }
interface Doc { id: string; title: string; folder_id: string | null; ocr_text: string | null; created_at: string; updated_at: string }
interface Page { id: string; document_id: string; position: number; original_path: string; processed_path: string; crop_corners: string | null; filter: string; rotation: number; brightness: number; contrast: number; ocr_text: string | null; ocr_language: string | null; created_at: string }
interface Ann { id: string; page_id: string; kind: string; data: string; created_at: string }
interface Sig { id: string; strokes: string; created_at: string }
interface Backup {
  app: 'ordo';
  version: number;
  folders: Folder[];
  documents: Doc[];
  pages: Page[];
  annotations: Ann[];
  tags: { id: string; name: string }[];
  document_tags: { document_id: string; tag_id: string }[];
  signatures: Sig[];
}

/** Where the backup file is written. `write` is called with pieces in order; `close` finishes the file. */
export interface Sink {
  write(chunk: Uint8Array): void;
  close(): Promise<void>;
}

/** What may go into a backup: not in the trash, not locked and not inside a locked folder. The PIN is
 *  not part of the backup, so a locked document would leave the phone without the lock that protects it. */
const BACKUP_DOCUMENTS_SQL = `
  select d.id, d.title, d.folder_id, d.ocr_text, d.created_at, d.updated_at
    from documents d
   where d.deleted_at is null
     and d.locked = 0
     and coalesce((select f.locked from folders f where f.id = d.folder_id), 0) = 0`;

/** Writes every document (not the trash), its pages' pictures, drawings, tags, folders and signatures.
 *  Settings, the PIN and locked documents are not included. Pictures go in one at a time, so memory stays small. */
export async function writeBackup(db: Db, readFile: (path: string) => Promise<Uint8Array>, sink: Sink): Promise<{ documents: number; files: number }> {
  const documents = await db.all<Doc>(BACKUP_DOCUMENTS_SQL);
  const ids = new Set(documents.map((d) => d.id));
  const pages = (await db.all<Page>('select * from pages order by document_id, position')).filter((p) => ids.has(p.document_id));
  const pageIds = new Set(pages.map((p) => p.id));
  const names = new Map<string, string>();
  const nameOf = (path: string) => {
    if (!names.has(path)) names.set(path, `files/${names.size + 1}.jpg`);
    return names.get(path)!;
  };
  const outPages = pages.map((p) => ({ ...p, original_path: nameOf(p.original_path), processed_path: nameOf(p.processed_path) }));
  const folderIds = new Set(documents.map((d) => d.folder_id).filter((x): x is string => !!x));
  let folders = await db.all<Folder>('select id, name, parent_id, created_at, updated_at from folders');
  // Keep folders that hold something, plus their parents.
  const keep = new Set(folderIds);
  for (const f of folders) if (keep.has(f.id) && f.parent_id) keep.add(f.parent_id);
  folders = folders.filter((f) => keep.has(f.id));
  const data: Backup = {
    app: 'ordo',
    version: BACKUP_VERSION,
    folders,
    documents,
    pages: outPages,
    annotations: (await db.all<Ann>('select id, page_id, kind, data, created_at from annotations')).filter((a) => pageIds.has(a.page_id)),
    tags: await db.all('select id, name from tags'),
    document_tags: (await db.all<{ document_id: string; tag_id: string }>('select document_id, tag_id from document_tags')).filter((d) => ids.has(d.document_id)),
    signatures: await db.all<Sig>('select id, strokes, created_at from signature_strokes'),
  };

  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    sink.write(chunk);
  });
  const add = (name: string, bytes: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(bytes, true);
  };
  add('data.json', strToU8(JSON.stringify(data)));
  for (const [path, name] of names) add(name, await readFile(path));
  zip.end();
  await sink.close();
  return { documents: documents.length, files: names.size };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A backup can be edited by hand; anything out of range is repaired instead of aborting the whole restore. */
const FILTERS = new Set(['original', 'enhanced', 'bw', 'gray']);
const ROTATIONS = [0, 90, 180, 270];
const slider = (v: unknown) => (isNum(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Reads a backup made by writeBackup and adds its contents as new documents (new ids, so nothing already on the phone is
 *  touched). Locks are not restored: the PIN is not in the backup. Throws on a file that is not an Ordo backup. */
export async function restoreBackup(
  db: Db,
  chunks: AsyncIterable<Uint8Array>,
  saveFile: (bytes: Uint8Array) => Promise<string>,
): Promise<{ documents: number; pages: number; skippedPages: number }> {
  const saved = new Map<string, string>();
  let dataJson: Uint8Array | null = null;
  const jobs: Promise<void>[] = [];
  let failure: unknown = null;
  let total = 0;
  let entries = 0;
  const unzip = new Unzip((file) => {
    if (++entries > MAX_ENTRIES) {
      failure = new Error('backup has too many files');
      return;
    }
    const parts: Uint8Array[] = [];
    let size = 0;
    const done = new Promise<void>((resolve) => {
      file.ondata = (err, data, final) => {
        if (err) {
          failure = err;
          return resolve();
        }
        size += data.length;
        if (file.name === 'data.json' && size > MAX_DATA_BYTES) {
          failure = new Error('backup data too large');
          return resolve();
        }
        if (file.name !== 'data.json') {
          if (size > MAX_FILE_BYTES) {
            failure = new Error('backup file too large');
            return resolve();
          }
          total += data.length;
          if (total > MAX_TOTAL_BYTES) {
            failure = new Error('backup too large');
            return resolve();
          }
        }
        parts.push(data);
        if (final) {
          const all = new Uint8Array(size);
          let at = 0;
          for (const p of parts) {
            all.set(p, at);
            at += p.length;
          }
          if (file.name === 'data.json') {
            dataJson = all;
            resolve();
          } else if (/^files\/\d+\.jpg$/.test(file.name)) {
            saveFile(all).then((uri) => void saved.set(file.name, uri)).catch((e) => (failure = e)).then(() => resolve());
          } else resolve();
        }
      };
    });
    jobs.push(done);
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);
  for await (const c of chunks) unzip.push(c, false);
  unzip.push(new Uint8Array(0), true);
  await Promise.all(jobs);
  const abandon = async () => {
    // Nothing was added to the database; the pictures saved so far are left for the caller to clean (returned in the error).
  };
  if (failure || !dataJson) {
    await abandon();
    throw Object.assign(new Error('not a valid Ordo backup'), { saved: [...saved.values()] });
  }
  let data: Partial<Backup>;
  try {
    data = JSON.parse(strFromU8(dataJson));
  } catch {
    throw Object.assign(new Error('not a valid Ordo backup'), { saved: [...saved.values()] });
  }
  if (data.app !== 'ordo' || data.version !== BACKUP_VERSION) throw Object.assign(new Error('not a valid Ordo backup'), { saved: [...saved.values()] });

  const folderMap = new Map<string, string>();
  const docMap = new Map<string, string>();
  const pageMap = new Map<string, string>();
  const tagMap = new Map<string, string>();
  let pagesAdded = 0;
  let skipped = 0;
  try {
    await db.transaction(async () => {
      // Parents first, so a folder's parent exists when the folder is added.
      const fl = arr(data.folders) as Folder[];
      for (const pass of [false, true]) {
        for (const f of fl) {
          if (!isStr(f.id) || !isStr(f.name) || (!!f.parent_id) !== pass) continue;
          const nid = newId();
          folderMap.set(f.id, nid);
          await db.run('insert into folders (id, name, parent_id, created_at, updated_at) values (?, ?, ?, ?, ?)', [nid, f.name.slice(0, 120) || 'Folder', pass ? folderMap.get(f.parent_id!) ?? null : null, isStr(f.created_at) ? f.created_at : new Date().toISOString(), isStr(f.updated_at) ? f.updated_at : new Date().toISOString()]);
        }
      }
      for (const d of arr(data.documents) as Doc[]) {
        if (!isStr(d.id) || !isStr(d.title)) continue;
        const nid = newId();
        docMap.set(d.id, nid);
        await db.run('insert into documents (id, title, folder_id, ocr_text, created_at, updated_at) values (?, ?, ?, ?, ?, ?)', [nid, d.title.slice(0, 200) || 'Document', d.folder_id ? folderMap.get(d.folder_id) ?? null : null, isStr(d.ocr_text) ? d.ocr_text : null, isStr(d.created_at) ? d.created_at : new Date().toISOString(), isStr(d.updated_at) ? d.updated_at : new Date().toISOString()]);
      }
      for (const p of arr(data.pages) as Page[]) {
        const doc = docMap.get(p.document_id);
        const orig = saved.get(p.original_path);
        const proc = saved.get(p.processed_path);
        if (!doc || !orig || !proc || !Number.isInteger(p.position) || p.position < 0) {
          skipped++;
          continue;
        }
        const nid = newId();
        pageMap.set(p.id, nid);
        pagesAdded++;
        await db.run(
          `insert into pages (id, document_id, position, original_path, processed_path, crop_corners, filter, rotation, brightness, contrast, ocr_text, ocr_language, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            nid,
            doc,
            p.position,
            orig,
            proc,
            isStr(p.crop_corners) ? p.crop_corners : null,
            FILTERS.has(p.filter) ? p.filter : 'original',
            ROTATIONS.includes(p.rotation) ? p.rotation : 0,
            slider(p.brightness),
            slider(p.contrast),
            isStr(p.ocr_text) ? p.ocr_text : null,
            isStr(p.ocr_language) ? p.ocr_language : null,
            isStr(p.created_at) ? p.created_at : new Date().toISOString(),
          ],
        );
      }
      for (const a of arr(data.annotations) as Ann[]) {
        const page = pageMap.get(a.page_id);
        if (!page || !isStr(a.data)) continue;
        try {
          const ok = validate(JSON.parse(a.data));
          await db.run('insert into annotations (id, page_id, kind, data, created_at) values (?, ?, ?, ?, ?)', [newId(), page, ok.kind, JSON.stringify(ok), isStr(a.created_at) ? a.created_at : new Date().toISOString()]);
        } catch {
          // a damaged annotation is skipped
        }
      }
      for (const tg of arr(data.tags) as { id: string; name: string }[]) {
        if (!isStr(tg.id) || !isStr(tg.name) || !tg.name.trim()) continue;
        const existing = await db.first<{ id: string }>('select id from tags where lower(name) = lower(?)', [tg.name.trim().slice(0, 40)]);
        if (existing) tagMap.set(tg.id, existing.id);
        else {
          const nid = newId();
          tagMap.set(tg.id, nid);
          await db.run('insert into tags (id, name) values (?, ?)', [nid, tg.name.trim().slice(0, 40)]);
        }
      }
      for (const dt of arr(data.document_tags) as { document_id: string; tag_id: string }[]) {
        const d = docMap.get(dt.document_id);
        const tg = tagMap.get(dt.tag_id);
        if (d && tg) await db.run('insert or ignore into document_tags (document_id, tag_id) values (?, ?)', [d, tg]);
      }
      for (const s of arr(data.signatures) as Sig[]) {
        if (!isStr(s.strokes)) continue;
        try {
          validate({ kind: 'signature', x: 0, y: 0, w: 0.3, aspect: 0.4, color: '#000000', strokes: JSON.parse(s.strokes) });
          await db.run('insert into signature_strokes (id, strokes, created_at) values (?, ?, ?)', [newId(), s.strokes, isStr(s.created_at) ? s.created_at : new Date().toISOString()]);
        } catch {
          // skipped
        }
      }
    });
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error('restore failed'), { saved: [...saved.values()] });
  }
  return { documents: docMap.size, pages: pagesAdded, skippedPages: skipped };
}
