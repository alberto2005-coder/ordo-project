import { Document, Packer, PageBreak, Paragraph, TextRun } from 'docx';

export interface TextPage {
  text: string;
}

/** Builds a Word file from recognised text: one paragraph per line, a page break between pages.
 *  This is plain text in Word, not a copy of the page layout. */
export async function buildDocx(title: string, pages: TextPage[]): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [];
  pages.forEach((page, i) => {
    if (i > 0) paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    const lines = page.text.replace(/\r\n?/g, '\n').split('\n');
    for (const line of lines) {
      // Control characters are not allowed in Word's XML and would corrupt the file.
      // eslint-disable-next-line no-control-regex
      const clean = line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
      paragraphs.push(new Paragraph({ children: [new TextRun(clean)] }));
    }
  });
  if (!paragraphs.length) paragraphs.push(new Paragraph(''));
  const doc = new Document({
    creator: 'Ordo',
    title: title.slice(0, 200),
    sections: [{ children: paragraphs }],
  });
  const base64 = await Packer.toBase64String(doc);
  return base64ToBytes(base64);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
