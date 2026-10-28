import initSqlJs, { type Database, type SqlValue as SJValue } from 'sql.js';
import type { Db, SqlValue } from '../src/data/db';

/** In-memory SQLite (sql.js) behind the same Db interface the phone uses. */
export async function openTestDb(): Promise<Db> {
  const SQL = await initSqlJs();
  const raw: Database = new SQL.Database();
  const bind = (p: SqlValue[] = []) => p as SJValue[];
  async function all<T>(sql: string, params?: SqlValue[]): Promise<T[]> {
    const stmt = raw.prepare(sql);
    try {
      stmt.bind(bind(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }
  const db: Db = {
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params) {
      raw.run(sql, bind(params));
    },
    all,
    async first<T>(sql: string, params?: SqlValue[]) {
      return (await all<T>(sql, params))[0] ?? null;
    },
    async transaction<T>(fn: () => Promise<T>) {
      raw.run('begin');
      try {
        const out = await fn();
        raw.run('commit');
        return out;
      } catch (e) {
        raw.run('rollback');
        throw e;
      }
    },
  };
  return db;
}
