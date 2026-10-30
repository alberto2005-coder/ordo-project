import * as DocumentPicker from 'expo-document-picker';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import type { NewPage } from '@/data/library';
import { keepScan, removeFiles } from './files';

export type PdfImportResult =
  | { status: 'ok'; pages: NewPage[]; title: string; truncated: boolean }
  | { status: 'cancelled' }
  | { status: 'locked' }
  | { status: 'error' };

export const MAX_PDF_PAGES = 100;

/** Lets the person choose a PDF and turns its pages into pictures inside the app.
 *  The text of the PDF is not kept: each page becomes an image, like a scan. PDFs that need a password to open are refused. */
export async function importPdf(): Promise<PdfImportResult> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  } catch {
    return { status: 'error' };
  }
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };
  const asset = picked.assets[0];
  const kept: string[] = [];
  try {
    const rendered = await PdfThumbnail.generateAllPages(asset.uri, { quality: 90, maxWidth: 1600 });
    if (!rendered.length) return { status: 'error' };
    const use = rendered.slice(0, MAX_PDF_PAGES);
    const pages: NewPage[] = [];
    for (const r of use) {
      const original = await keepScan(r.uri);
      kept.push(original);
      pages.push({ originalPath: original });
    }
    return { status: 'ok', pages, title: asset.name.replace(/\.pdf$/i, '').slice(0, 200) || 'PDF', truncated: rendered.length > use.length };
  } catch (e) {
    removeFiles(kept);
    return (e as { code?: string })?.code === 'PASSWORD_PROTECTED' ? { status: 'locked' } : { status: 'error' };
  }
}
