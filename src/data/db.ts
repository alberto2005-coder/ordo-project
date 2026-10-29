import { MIGRATION_2, SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export type SqlValue = string | number | null;

/** The small surface the app needs from a SQLite database. Implemented by
 *  expo-sqlite on the phone and by sql.js in tests, so the same logic runs in both. */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Runs every migration the database has not seen yet, in order, and records the version. */
export async function migrate(db: Db): Promise<void> {
  // Must run outside any transaction (SQLite ignores it inside one), and on every connection.
  await db.exec('pragma foreign_keys = on');
  const row = await db.first<{ user_version: number }>('pragma user_version');
  let current = row?.user_version ?? 0;
  const steps: string[] = [SCHEMA_SQL, MIGRATION_2];
  while (current < SCHEMA_VERSION) {
    await db.transaction(async () => {
      await db.exec(steps[current]);
      await db.exec(`pragma user_version = ${current + 1}`);
    });
    current++;
  }
}
