import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { listAnnotationsForDocument, type AnnotationData } from '@/data/annotations';
import type { Db } from '@/data/db';
import { getDocument, type ExportQuality, type PdfPageSize } from '@/data/library';
import { buildDocx } from '@/export/docx';
import { buildPptx } from '@/export/pptx';
import { buildXlsx } from '@/export/xlsx';
import { zipFiles } from '@/export/zip';
import { burnAnnotations } from '@/image/burn';
import { decodeJpeg, encodeJpeg } from '@/image/process';
import { encodePng } from '@/image/png';
import { loadTextFont, type Font } from '@/image/text';
import { buildPdf, QUALITY_PRESETS, type PageImage } from '@/pdf/buildPdf';
import { fileSize, readBytes, writeExport } from './files';

export type ExportOutcome =
  | { status: 'ok'; uri: string; size: number; mime: string; uti: string }
  | { status: 'error'; reason: 'empty' | 'failed' };

export interface PdfExportOptions {
  quality: ExportQuality;
  pageSize: PdfPageSize;
  password?: string;
  watermark?: string;
  orientation?: 'auto' | 'portrait' | 'landscape';
  margin?: 'none' | 'small' | 'normal';
  pageNumbers?: boolean;
  /** Only these pages, in document order. Missing or empty means the whole document. */
  pageIds?: string[];
}

/** The document's pages, or just the chosen ones, in document order. */
function chosen<T extends { id: string }>(pages: T[], ids?: string[]): T[] {
  if (!ids?.length) return pages;
  const set = new Set(ids);
  return pages.filter((p) => set.has(p.id));
}

const MIME = {
  pdf: { mime: 'application/pdf', uti: 'com.adobe.pdf' },
  zip: { mime: 'application/zip', uti: 'public.zip-archive' },
  jpg: { mime: 'image/jpeg', uti: 'public.jpeg' },
  png: { mime: 'image/png', uti: 'public.png' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', uti: 'org.openxmlformats.spreadsheetml.sheet' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uti: 'org.openxmlformats.presentationml.presentation' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uti: 'org.openxmlformats.wordprocessingml.document' },
} as const;

/** Shrinks a page image for the chosen quality. 'high' reads the file as it is. */
async function loadPageBytes(uri: string, quality: ExportQuality): Promise<Uint8Array> {
  const preset = QUALITY_PRESETS[quality];
  if (!preset) return readBytes(uri);
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: preset.maxSide } }], {
    compress: preset.jpeg,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return readBytes(out.uri);
}

/** Builds the PDF for a document, with its drawings, text and signatures on top, and writes it to the cache.
 *  One page at a time keeps memory low. */
export async function exportDocumentPdf(db: Db, docId: string, opts: PdfExportOptions): Promise<ExportOutcome> {
  const got = await getDocument(db, docId);
  if (!got || !got.pages.length) return { status: 'error', reason: 'empty' };
  try {
    const notes = await listAnnotationsForDocument(db, docId);
    const images: PageImage[] = [];
    const picked = chosen(got.pages, opts.pageIds);
    if (!picked.length) return { status: 'error', reason: 'empty' };
    for (const p of picked) {
      images.push({
        bytes: await loadPageBytes(p.processed_path, opts.quality),
        format: 'jpg',
        annotations: (notes.get(p.id) ?? []).map((a) => a.data),
      });
    }
    const bytes = await buildPdf(images, { pageSize: opts.pageSize, title: got.doc.title, password: opts.password, watermark: opts.watermark, orientation: opts.orientation, margin: opts.margin, pageNumbers: opts.pageNumbers });
    const uri = await writeExport(got.doc.title, 'pdf', bytes);
    return { status: 'ok', uri, size: bytes.length, ...MIME.pdf };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

/** The font for typed text in pictures. If it can't be loaded the text is left out (and reported), never a crash. */
function textFont(): Font | undefined {
  try {
    return loadTextFont();
  } catch {
    return undefined;
  }
}

/** The page pictures as image bytes (JPG or lossless PNG), with drawings and signatures painted in.
 *  Typed text is painted with the bundled font (`skippedText` counts any that could not be). */
async function buildImageFiles(db: Db, docId: string, quality: ExportQuality, opts: { format?: 'jpg' | 'png'; pageIds?: string[] }) {
  const got = await getDocument(db, docId);
  const picked = got ? chosen(got.pages, opts.pageIds) : [];
  if (!got || !picked.length) return null;
  const format = opts.format ?? 'jpg';
  const notes = await listAnnotationsForDocument(db, docId);
  const files: { name: string; bytes: Uint8Array }[] = [];
  let skippedText = 0;
  for (let i = 0; i < picked.length; i++) {
    let bytes = await loadPageBytes(picked[i].processed_path, quality);
    const anns: AnnotationData[] = (notes.get(picked[i].id) ?? []).map((a) => a.data);
    if (format === 'png') {
      let pixels = decodeJpeg(bytes);
      if (anns.length) {
        const burned = burnAnnotations(pixels, anns, textFont());
        skippedText += burned.skippedText;
        pixels = burned.pixels;
      }
      bytes = encodePng(pixels);
    } else if (anns.length) {
      const burned = burnAnnotations(decodeJpeg(bytes), anns, textFont());
      skippedText += burned.skippedText;
      bytes = encodeJpeg(burned.pixels, 90);
    }
    files.push({ name: `${got.doc.title} ${i + 1}.${format}`, bytes });
  }
  return { title: got.doc.title, format, files, skippedText };
}

/** One page gives one image file, several give a ZIP. */
export async function exportDocumentImages(
  db: Db,
  docId: string,
  quality: ExportQuality,
  opts: { format?: 'jpg' | 'png'; pageIds?: string[] } = {},
): Promise<ExportOutcome & { skippedText?: number }> {
  try {
    const built = await buildImageFiles(db, docId, quality, opts);
    if (!built) return { status: 'error', reason: 'empty' };
    const { title, format, files, skippedText } = built;
    if (files.length === 1) {
      const uri = await writeExport(title, format, files[0].bytes);
      return { status: 'ok', uri, size: files[0].bytes.length, skippedText, ...MIME[format] };
    }
    const zip = zipFiles(files);
    const uri = await writeExport(title, 'zip', zip);
    return { status: 'ok', uri, size: zip.length, skippedText, ...MIME.zip };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

/** Each page as its own image file (for saving to the gallery). */
export async function exportImageFiles(
  db: Db,
  docId: string,
  quality: ExportQuality,
  opts: { format?: 'jpg' | 'png'; pageIds?: string[] } = {},
): Promise<{ status: 'ok'; uris: string[]; skippedText: number } | { status: 'error' }> {
  try {
    const built = await buildImageFiles(db, docId, quality, opts);
    if (!built) return { status: 'error' };
    const uris: string[] = [];
    for (const f of built.files) uris.push(await writeExport(`${built.title} ${uris.length + 1}`, built.format, f.bytes));
    return { status: 'ok', uris, skippedText: built.skippedText };
  } catch {
    return { status: 'error' };
  }
}

/** Plain text of a document (from OCR) as a Word file. It is text, not a copy of the page layout. */
export async function exportDocumentWord(title: string, pageTexts: string[]): Promise<ExportOutcome> {
  try {
    const bytes = await buildDocx(title, pageTexts.map((text) => ({ text })));
    const uri = await writeExport(title, 'docx', bytes);
    return { status: 'ok', uri, size: bytes.length, ...MIME.docx };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

/** Recognised text as a spreadsheet: one sheet per page, columns split where the gaps are. */
export async function exportDocumentExcel(title: string, pageTexts: string[]): Promise<ExportOutcome> {
  try {
    const bytes = buildXlsx(pageTexts.map((text, i) => ({ name: `Page ${i + 1}`, text })));
    const uri = await writeExport(title, 'xlsx', bytes);
    return { status: 'ok', uri, size: bytes.length, ...MIME.xlsx };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

/** One slide per page with the page picture (and its drawings). Pictures, not editable text. */
export async function exportDocumentPowerpoint(db: Db, docId: string, quality: ExportQuality, pageIds?: string[]): Promise<ExportOutcome> {
  const got = await getDocument(db, docId);
  if (!got || !got.pages.length) return { status: 'error', reason: 'empty' };
  try {
    const notes = await listAnnotationsForDocument(db, docId);
    const jpegs: Uint8Array[] = [];
    for (const page of chosen(got.pages, pageIds)) {
      let bytes = await loadPageBytes(page.processed_path, quality);
      const anns: AnnotationData[] = (notes.get(page.id) ?? []).map((a) => a.data);
      if (anns.length) bytes = encodeJpeg(burnAnnotations(decodeJpeg(bytes), anns, textFont()).pixels, 90);
      jpegs.push(bytes);
    }
    const out = buildPptx(jpegs);
    const uri = await writeExport(got.doc.title, 'pptx', out);
    return { status: 'ok', uri, size: out.length, ...MIME.pptx };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

/** Several documents at once: each one as a PDF, all in one ZIP. */
export async function exportDocumentsZip(db: Db, docIds: string[], opts: PdfExportOptions): Promise<ExportOutcome> {
  try {
    const files: { name: string; bytes: Uint8Array }[] = [];
    for (const id of docIds) {
      const got = await getDocument(db, id);
      const out = await exportDocumentPdf(db, id, opts);
      if (!got || out.status !== 'ok') return { status: 'error', reason: 'failed' };
      files.push({ name: `${got.doc.title}.pdf`, bytes: await readBytes(out.uri) });
    }
    if (!files.length) return { status: 'error', reason: 'empty' };
    const zip = zipFiles(files);
    const uri = await writeExport('Ordo', 'zip', zip);
    return { status: 'ok', uri, size: zip.length, ...MIME.zip };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}

export async function canShare(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

export async function shareFile(out: { uri: string; mime: string; uti: string }): Promise<void> {
  await Sharing.shareAsync(out.uri, { mimeType: out.mime, UTI: out.uti });
}

export async function printPdf(uri: string): Promise<void> {
  await Print.printAsync({ uri });
}

export { fileSize };

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
