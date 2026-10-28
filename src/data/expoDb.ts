import * as SQLite from 'expo-sqlite';
import { migrate, type Db, type SqlValue } from './db';

function wrap(raw: SQLite.SQLiteDatabase): Db {
  return {
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, params = []) => {
      await raw.runAsync(sql, params as SQLite.SQLiteBindParams);
    },
    all: <T,>(sql: string, params: SqlValue[] = []) =>
      raw.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams),
    first: <T,>(sql: string, params: SqlValue[] = []) =>
      raw.getFirstAsync<T>(sql, params as SQLite.SQLiteBindParams),
    transaction: async <T,>(fn: () => Promise<T>) => {
      let result!: T;
      await raw.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    },
  };
}

let opening: Promise<Db> | null = null;

/** One database for the whole app, opened and migrated once. */
export function getDb(): Promise<Db> {
  if (!opening) {
    opening = (async () => {
      const raw = await SQLite.openDatabaseAsync('ordo.db');
      await raw.execAsync('pragma journal_mode = wal');
      const db = wrap(raw);
      await migrate(db);
      return db;
    })();
  }
  return opening;
}
