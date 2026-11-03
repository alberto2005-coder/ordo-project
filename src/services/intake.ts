import { Alert } from 'react-native';
import { getDb } from '@/data/expoDb';
import { addPages, createDocument, type Filter, type NewPage } from '@/data/library';
import { t } from '@/i18n';
import { canModifyDocument } from './auth';
import { buildPages, type CaptureConfig, type CaptureMode } from './capture';
import { importFromGallery } from './gallery';
import { removeFiles } from './files';
import { importPdf } from './pdfImport';
import { scanPages } from './scan';

type Target = { newIn: string | null; title: string } | { addTo: string };

async function store(pages: NewPage[], target: Target): Promise<string | null> {
  const db = await getDb();
  try {
    if ('addTo' in target) {
      // A locked document must not take new pages just because a screen (or a deep link) asked for it.
      if (!(await canModifyDocument(db, target.addTo))) {
        removeFiles(pages.flatMap((p) => [p.originalPath, p.processedPath ?? p.originalPath]));
        Alert.alert(t('lock.lockedWrite'));
        return null;
      }
      await addPages(db, target.addTo, pages);
      return target.addTo;
    }
    return await createDocument(db, { title: target.title, pages, folderId: target.newIn });
  } catch (e) {
    console.error('[Ordo] saving pages failed', e);
    removeFiles(pages.flatMap((p) => [p.originalPath, p.processedPath ?? p.originalPath]));
    Alert.alert(t('error.generic'));
    return null;
  }
}

/** Saves ready pages as a new document or adds them to one. Returns the document id, or null if nothing was saved. */
export const saveNewPages = store;

/** Scans with the phone's scanner and saves the pages, shaped for the mode: documents as they are, receipts with the
 *  "enhanced" filter, ID cards (front and back) on one sheet, open books split into two pages. */
export async function scanInto(target: Target, mode: CaptureMode = 'doc', cfg: CaptureConfig = { filter: 'original', detect: false }): Promise<string | null> {
  const r = await scanPages(mode === 'id' ? 2 : undefined);
  if (r.status === 'error') {
    Alert.alert(t('scan.failed'));
    return null;
  }
  if (r.status !== 'ok') return null;
  if (mode === 'doc' && cfg.filter === 'original') return store(r.paths.map((originalPath) => ({ originalPath })), target);
  try {
    const pages = await buildPages(r.paths, mode, cfg, true);
    removeFiles(r.paths); // buildPages made its own copies
    return store(pages, target);
  } catch {
    removeFiles(r.paths);
    Alert.alert(t('error.generic'));
    return null;
  }
}

/** Turns a PDF from the phone's files into pages. */
export async function importPdfInto(target: Target): Promise<string | null> {
  const r = await importPdf();
  if (r.status === 'locked') {
    Alert.alert(t('pdfImport.locked'));
    return null;
  }
  if (r.status === 'error') {
    Alert.alert(t('pdfImport.failed'));
    return null;
  }
  if (r.status !== 'ok') return null;
  if (r.truncated) Alert.alert(t('pdfImport.truncated', { n: r.pages.length }));
  const t2 = 'addTo' in target ? target : { ...target, title: r.title };
  return store(r.pages, t2);
}

/** Lets the person pick photos and saves them as pages. */
export async function importInto(target: Target, defaultFilter: Filter, onProgress?: (done: number, total: number) => void, autoCrop = false): Promise<string | null> {
  const r = await importFromGallery(defaultFilter, onProgress, autoCrop);
  if (r.status === 'error') {
    Alert.alert(t('library.importFailed'));
    return null;
  }
  if (r.status !== 'ok') return null;
  return store(r.pages, target);
}
