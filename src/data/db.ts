import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

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

/** Creates the tables on first run. Later versions add migrations here. */
export async function migrate(db: Db): Promise<void> {
  const row = await db.first<{ user_version: number }>('pragma user_version');
  const current = row?.user_version ?? 0;
  if (current < 1) {
    await db.exec(SCHEMA_SQL);
  }
  if (current < SCHEMA_VERSION) {
    await db.exec(`pragma user_version = ${SCHEMA_VERSION}`);
  }
}
