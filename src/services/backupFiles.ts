import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { restoreBackup, writeBackup, type Sink } from '@/backup/backup';
import type { Db } from '@/data/db';
import { readBytes, removeFiles, safeFileName, writeScanBytes } from './files';

export type BackupResult = { status: 'ok'; uri: string; documents: number } | { status: 'empty' } | { status: 'error' };

/** Writes a backup ZIP to the cache and returns it, ready for the share sheet or "save to a folder". */
export async function createBackupFile(db: Db): Promise<BackupResult> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(dir, `${safeFileName(`Ordo backup ${stamp}`)}.zip`);
  if (file.exists) file.delete();
  file.create();
  const stream = file.writableStream();
  const writer = stream.getWriter();
  let chain: Promise<void> = Promise.resolve();
  const sink: Sink = {
    write: (chunk) => void (chain = chain.then(() => writer.write(chunk))),
    close: async () => {
      await chain;
      await writer.close();
    },
  };
  try {
    const info = await writeBackup(db, readBytes, sink);
    if (!info.documents) {
      file.delete();
      return { status: 'empty' };
    }
    return { status: 'ok', uri: file.uri, documents: info.documents };
  } catch {
    try {
      file.delete();
    } catch {
      // nothing to clean
    }
    return { status: 'error' };
  }
}

export type RestoreOutcome = { status: 'ok'; documents: number; pages: number; skippedPages: number } | { status: 'cancelled' } | { status: 'error' };

/** Lets the person pick a backup ZIP and adds its documents. Pictures are saved as they are read, one at a time. */
export async function restoreBackupFile(db: Db): Promise<RestoreOutcome> {
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  } catch {
    return { status: 'error' };
  }
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };
  const source = new File(picked.assets[0].uri);
  const reader = source.readableStream().getReader();
  async function* chunks() {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  }
  try {
    const r = await restoreBackup(db, chunks(), writeScanBytes);
    return { status: 'ok', ...r };
  } catch (e) {
    removeFiles((e as { saved?: string[] }).saved ?? []);
    return { status: 'error' };
  } finally {
    try {
      source.delete();
    } catch {
      // cache copy; the system clears it anyway
    }
  }
}
