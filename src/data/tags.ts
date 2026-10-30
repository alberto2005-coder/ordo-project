import type { Db } from './db';
import { newId } from './library';

export interface TagSummary {
  id: string;
  name: string;
  doc_count: number;
}

function cleanTag(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!n) throw new Error('tag is empty');
  return n;
}

/** Replaces a document's tags with exactly these names (created if new). Tags nobody uses are removed. */
export async function setDocumentTags(db: Db, docId: string, names: string[]) {
  // Same tag in different capitals counts once, and the first spelling wins.
  const seen = new Map<string, string>();
  for (const n of names) {
    const c = cleanTag(n);
    if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  const clean = [...seen.values()];
  await db.transaction(async () => {
    await db.run('delete from document_tags where document_id = ?', [docId]);
    for (const name of clean) {
      const existing = await db.first<{ id: string }>('select id from tags where lower(name) = lower(?)', [name]);
      const id = existing?.id ?? newId();
      if (!existing) await db.run('insert into tags (id, name) values (?, ?)', [id, name]);
      await db.run('insert into document_tags (document_id, tag_id) values (?, ?)', [docId, id]);
    }
    await db.run('delete from tags where id not in (select tag_id from document_tags)');
  });
}

export async function getDocumentTags(db: Db, docId: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `select t.name from tags t join document_tags dt on dt.tag_id = t.id
      where dt.document_id = ? order by lower(t.name)`,
    [docId],
  );
  return rows.map((r) => r.name);
}

export async function listTags(db: Db): Promise<TagSummary[]> {
  return db.all<TagSummary>(
    `select t.id, t.name, (select count(*) from document_tags dt join documents d on d.id = dt.document_id where dt.tag_id = t.id and d.deleted_at is null) as doc_count
       from tags t order by lower(t.name)`,
  );
}
