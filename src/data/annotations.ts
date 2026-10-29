import type { Db } from './db';
import { newId } from './library';

export type Point = [number, number];

/** All coordinates are fractions of the page image (0..1), so they survive any export size. */
export type AnnotationData =
  | { kind: 'draw' | 'highlight'; color: string; width: number; points: Point[] }
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { kind: 'signature'; x: number; y: number; w: number; aspect: number; color: string; strokes: Point[][] };

export interface Annotation {
  id: string;
  page_id: string;
  data: AnnotationData;
  created_at: string;
}

const unit = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= -0.5 && n <= 1.5;
const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && unit(p[0]) && unit(p[1]);
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

/** Checks a stored or incoming annotation. Anything malformed is rejected instead of drawn. */
export function validate(data: unknown): AnnotationData {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== 'object') throw new Error('invalid annotation');
  switch (d.kind) {
    case 'draw':
    case 'highlight':
      if (!isColor(d.color) || typeof d.width !== 'number' || d.width <= 0 || d.width > 0.2) throw new Error('invalid stroke');
      if (!Array.isArray(d.points) || d.points.length < 1 || d.points.length > 5000 || !d.points.every(isPoint)) throw new Error('invalid stroke points');
      return { kind: d.kind, color: d.color, width: d.width, points: d.points as Point[] };
    case 'text':
      if (!unit(d.x) || !unit(d.y) || typeof d.text !== 'string' || !d.text.trim() || d.text.length > 500) throw new Error('invalid text');
      if (typeof d.size !== 'number' || d.size <= 0 || d.size > 0.3 || !isColor(d.color)) throw new Error('invalid text style');
      return { kind: 'text', x: d.x, y: d.y, text: d.text, size: d.size, color: d.color };
    case 'signature':
      if (!unit(d.x) || !unit(d.y) || typeof d.w !== 'number' || d.w <= 0 || d.w > 1 || typeof d.aspect !== 'number' || d.aspect <= 0 || d.aspect > 5) throw new Error('invalid signature box');
      if (!isColor(d.color) || !Array.isArray(d.strokes) || d.strokes.length < 1 || d.strokes.length > 100) throw new Error('invalid signature strokes');
      if (!d.strokes.every((s) => Array.isArray(s) && s.length >= 1 && s.length <= 2000 && s.every(isPoint))) throw new Error('invalid signature points');
      return { kind: 'signature', x: d.x, y: d.y, w: d.w, aspect: d.aspect, color: d.color, strokes: d.strokes as Point[][] };
    default:
      throw new Error('unknown annotation kind');
  }
}

export async function addAnnotation(db: Db, pageId: string, data: AnnotationData, now = new Date()): Promise<string> {
  const ok = validate(data);
  const page = await db.first<{ id: string }>('select id from pages where id = ?', [pageId]);
  if (!page) throw new Error('page not found');
  const id = newId();
  await db.run('insert into annotations (id, page_id, kind, data, created_at) values (?, ?, ?, ?, ?)', [id, pageId, ok.kind, JSON.stringify(ok), now.toISOString()]);
  return id;
}

export async function listAnnotations(db: Db, pageId: string): Promise<Annotation[]> {
  const rows = await db.all<{ id: string; page_id: string; data: string; created_at: string }>(
    'select id, page_id, data, created_at from annotations where page_id = ? order by created_at, rowid',
    [pageId],
  );
  const out: Annotation[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, page_id: r.page_id, created_at: r.created_at, data: validate(JSON.parse(r.data)) });
    } catch {
      // A damaged row is skipped, not allowed to break the page.
    }
  }
  return out;
}

export async function listAnnotationsForDocument(db: Db, docId: string): Promise<Map<string, Annotation[]>> {
  const pages = await db.all<{ id: string }>('select id from pages where document_id = ? order by position', [docId]);
  const map = new Map<string, Annotation[]>();
  for (const p of pages) map.set(p.id, await listAnnotations(db, p.id));
  return map;
}

export async function removeAnnotation(db: Db, id: string) {
  await db.run('delete from annotations where id = ?', [id]);
}

/** Undo: removes the most recent annotation on the page. Returns false if there was none. */
export async function removeLastAnnotation(db: Db, pageId: string): Promise<boolean> {
  const last = await db.first<{ id: string }>('select id from annotations where page_id = ? order by created_at desc, rowid desc limit 1', [pageId]);
  if (!last) return false;
  await db.run('delete from annotations where id = ?', [last.id]);
  return true;
}

export async function saveSignature(db: Db, strokes: Point[][], now = new Date()): Promise<string> {
  validate({ kind: 'signature', x: 0, y: 0, w: 0.3, aspect: 0.4, color: '#000000', strokes });
  const id = newId();
  await db.run('insert into signature_strokes (id, strokes, created_at) values (?, ?, ?)', [id, JSON.stringify(strokes), now.toISOString()]);
  return id;
}

export async function listSignatures(db: Db): Promise<{ id: string; strokes: Point[][] }[]> {
  const rows = await db.all<{ id: string; strokes: string }>('select id, strokes from signature_strokes order by created_at desc');
  const out: { id: string; strokes: Point[][] }[] = [];
  for (const r of rows) {
    try {
      const s = JSON.parse(r.strokes) as Point[][];
      validate({ kind: 'signature', x: 0, y: 0, w: 0.3, aspect: 0.4, color: '#000000', strokes: s });
      out.push({ id: r.id, strokes: s });
    } catch {
      // skip damaged
    }
  }
  return out;
}

export async function deleteSignature(db: Db, id: string) {
  await db.run('delete from signature_strokes where id = ?', [id]);
}
