import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import type { AnnotationData } from '@/data/annotations';
import { drawAnnotation, drawWatermark, loadFont } from './draw';

export interface PageImage {
  bytes: Uint8Array;
  format: 'jpg' | 'png';
  /** Drawings, text and signatures, drawn as vectors on top of the picture. */
  annotations?: AnnotationData[];
}
export type PdfPageSize = 'A4' | 'Letter' | 'fit';
export interface PdfOptions {
  pageSize: PdfPageSize;
  title?: string;
  /** Opens only with this password. AES-256. Empty or missing means no encryption. */
  password?: string;
  /** Faint diagonal text over every page. */
  watermark?: string;
  /** auto = landscape for wide pictures. Ignored for 'fit'. */
  orientation?: 'auto' | 'portrait' | 'landscape';
  /** White border around the picture. */
  margin?: 'none' | 'small' | 'normal';
  /** Prints "n / total" at the bottom of every page. */
  pageNumbers?: boolean;
}

export const MARGIN_POINTS = { none: 0, small: 18, normal: 36 } as const;

// PDF points (1/72 inch).
const SIZES = { A4: [595.28, 841.89], Letter: [612, 792] } as const;
const FIT_LONG_SIDE = 842;

/** Builds a PDF from page images, one image per page, centred and scaled to fit.
 *  Pure JavaScript, so it runs the same on the phone and in tests. */
export async function buildPdf(images: PageImage[], opts: PdfOptions): Promise<Uint8Array> {
  if (!images.length) throw new Error('no pages to export');
  // updateMetadata: false stops the library stamping its own name and dates on the file.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setProducer('Ordo');
  pdf.setCreator('Ordo');
  if (opts.title) pdf.setTitle(opts.title);

  const font = await loadFont(pdf);
  for (const img of images) {
    const embedded = img.format === 'png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    // Page numbers need room, so they bring a small margin with them.
    const m = MARGIN_POINTS[opts.margin === 'none' && opts.pageNumbers ? 'small' : opts.margin ?? 'none'];
    let pageW: number;
    let pageH: number;
    if (opts.pageSize === 'fit') {
      const scale = (FIT_LONG_SIDE - 2 * m) / Math.max(embedded.width, embedded.height);
      pageW = embedded.width * scale + 2 * m;
      pageH = embedded.height * scale + 2 * m;
    } else {
      const [short, long] = SIZES[opts.pageSize].slice().sort((a, b) => a - b);
      const landscape = opts.orientation === 'landscape' || ((opts.orientation ?? 'auto') === 'auto' && embedded.width > embedded.height);
      [pageW, pageH] = landscape ? [long, short] : [short, long];
    }
    const scale = Math.min((pageW - 2 * m) / embedded.width, (pageH - 2 * m) / embedded.height);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    const page = pdf.addPage([pageW, pageH]);
    const area = { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h };
    page.drawImage(embedded, area);
    if (opts.pageNumbers) {
      const label = `${pdf.getPageCount()} / ${images.length}`;
      page.drawText(label, { x: (pageW - font.widthOfTextAtSize(label, 9)) / 2, y: Math.max(4, (m - 9) / 2), size: 9, font, color: rgb(0.35, 0.35, 0.35) });
    }
    for (const a of img.annotations ?? []) drawAnnotation(page, area, a, font);
    if (opts.watermark?.trim()) drawWatermark(page, opts.watermark, font);
  }
  if (opts.password) {
    // The owner password is random and thrown away: nobody, including the app, can
    // use it to lift the restrictions. Only the user's password opens the file.
    const rnd = new Uint8Array(24);
    crypto.getRandomValues(rnd);
    pdf.encrypt({
      userPassword: opts.password,
      ownerPassword: Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join(''),
      // A password is set to protect the contents, so copying is closed too; the restrictions are
      // advisory in the PDF standard and only a determined reader can remove them.
      permissions: { printing: 'highResolution', copying: false, modifying: false, annotating: false },
      algorithm: 'AES-256',
    });
  }
  return pdf.save();
}

/** Image longest side and JPEG quality per export level. 'high' keeps the original. */
export const QUALITY_PRESETS = {
  low: { maxSide: 1280, jpeg: 0.55 },
  medium: { maxSide: 1920, jpeg: 0.75 },
  high: null,
} as const;
