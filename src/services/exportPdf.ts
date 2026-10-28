import * as ImageManipulator from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { getDocument, type ExportQuality, type PdfPageSize } from '@/data/library';
import type { Db } from '@/data/db';
import { buildPdf, QUALITY_PRESETS, type PageImage } from '@/pdf/buildPdf';
import { readBytes, writeExport } from './files';

export type ExportOutcome =
  | { status: 'ok'; uri: string }
  | { status: 'error'; reason: 'empty' | 'failed' };

/** Shrinks a page image for the chosen quality. 'high' reads the original file as it is. */
async function loadPage(uri: string, quality: ExportQuality): Promise<PageImage> {
  const preset = QUALITY_PRESETS[quality];
  if (!preset) return { bytes: await readBytes(uri), format: 'jpg' };
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: preset.maxSide } }],
    { compress: preset.jpeg, format: ImageManipulator.SaveFormat.JPEG },
  );
  return { bytes: await readBytes(out.uri), format: 'jpg' };
}

/** Builds the PDF for a document and writes it to the cache. One page at a time keeps memory low. */
export async function exportDocumentPdf(
  db: Db,
  docId: string,
  opts: { quality: ExportQuality; pageSize: PdfPageSize },
): Promise<ExportOutcome> {
  const got = await getDocument(db, docId);
  if (!got || !got.pages.length) return { status: 'error', reason: 'empty' };
  try {
    const images: PageImage[] = [];
    for (const p of got.pages) images.push(await loadPage(p.processed_path, opts.quality));
    const bytes = await buildPdf(images, { pageSize: opts.pageSize, title: got.doc.title });
    return { status: 'ok', uri: await writeExport(got.doc.title, bytes) };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

export async function canShare(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

export async function sharePdf(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
