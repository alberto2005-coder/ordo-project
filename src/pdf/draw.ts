import { rgb, StandardFonts, type PDFFont, type PDFPage, degrees } from '@cantoo/pdf-lib';
import type { Annotation, AnnotationData } from '@/data/annotations';

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** The standard PDF fonts only cover Latin text (including Spanish accents). Anything else becomes "?"
 *  instead of making the whole export fail. */
export function safeText(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = '';
  for (const ch of text.replace(/[\r\t]/g, ' ')) {
    const cp = ch.codePointAt(0)!;
    out += cp === 10 || supported.has(cp) ? ch : '?';
  }
  return out;
}

/** Fractions of the picture -> PDF points. The PDF's origin is bottom-left; ours is top-left. */
const px = (a: Area, nx: number) => a.x + nx * a.width;
const py = (a: Area, ny: number) => a.y + a.height - ny * a.height;

function strokePath(page: PDFPage, area: Area, points: [number, number][], thickness: number, color: string, opacity: number) {
  const c = hexToRgb(color);
  const col = rgb(c.r, c.g, c.b);
  if (points.length === 1) {
    page.drawCircle({ x: px(area, points[0][0]), y: py(area, points[0][1]), size: thickness / 2, color: col, opacity });
    return;
  }
  for (let i = 1; i < points.length; i++) {
    page.drawLine({
      start: { x: px(area, points[i - 1][0]), y: py(area, points[i - 1][1]) },
      end: { x: px(area, points[i][0]), y: py(area, points[i][1]) },
      thickness,
      color: col,
      opacity,
      lineCap: 1, // round, so joints between segments are smooth
    });
  }
}

export function drawAnnotation(page: PDFPage, area: Area, data: AnnotationData, font: PDFFont) {
  switch (data.kind) {
    case 'draw':
      strokePath(page, area, data.points, data.width * area.width, data.color, 1);
      break;
    case 'highlight':
      strokePath(page, area, data.points, data.width * area.width, data.color, 0.35);
      break;
    case 'text': {
      const c = hexToRgb(data.color);
      const size = Math.max(4, data.size * area.width);
      const lines = safeText(font, data.text).split('\n');
      lines.forEach((line, i) => {
        page.drawText(line, { x: px(area, data.x), y: py(area, data.y) - size * (1 + i * 1.2), size, font, color: rgb(c.r, c.g, c.b) });
      });
      break;
    }
    case 'signature': {
      const boxW = data.w * area.width;
      const boxH = boxW * data.aspect;
      const thickness = Math.max(1, boxW * 0.012);
      for (const stroke of data.strokes) {
        const mapped = stroke.map(([sx, sy]): [number, number] => [
          data.x + (sx * boxW) / area.width,
          data.y + (sy * boxH) / area.height,
        ]);
        strokePath(page, area, mapped, thickness, data.color, 1);
      }
      break;
    }
  }
}

export async function loadFont(pdf: { embedFont: (f: StandardFonts) => Promise<PDFFont> }): Promise<PDFFont> {
  return pdf.embedFont(StandardFonts.Helvetica);
}

export function drawWatermark(page: PDFPage, text: string, font: PDFFont) {
  const { width, height } = page.getSize();
  const safe = safeText(font, text).replace(/\n/g, ' ').trim();
  if (!safe) return;
  const diag = Math.hypot(width, height);
  let size = Math.min(96, (diag * 0.7) / Math.max(4, safe.length) * 1.8);
  size = Math.max(14, size);
  const textW = font.widthOfTextAtSize(safe, size);
  const angle = Math.atan2(height, width) * (180 / Math.PI) * 0.9;
  const rad = (angle * Math.PI) / 180;
  // Centre the text on the page: move back by half its length along the rotated baseline.
  page.drawText(safe, {
    x: width / 2 - (Math.cos(rad) * textW) / 2 + (Math.sin(rad) * size) / 3,
    y: height / 2 - (Math.sin(rad) * textW) / 2 - (Math.cos(rad) * size) / 3,
    size,
    font,
    color: rgb(0.5, 0.5, 0.5),
    opacity: 0.3,
    rotate: degrees(angle),
  });
}

export type { Annotation };
