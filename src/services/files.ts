import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '@/data/library';

/** Everything the app keeps lives in its own private folder. */
const scans = () => new Directory(Paths.document, 'scans');
const cache = (name: string) => new Directory(Paths.cache, name);

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

/** The scanner and the photo picker leave images in a temporary place. Copy them into the app folder so they survive. */
export async function keepScan(tempUri: string): Promise<string> {
  const dir = scans();
  ensure(dir);
  const target = new File(dir, `${newId()}.jpg`);
  await new File(tempUri).copy(target);
  return target.uri;
}

/** Saves finished image bytes (an edited page) in the app folder. */
export async function writeScanBytes(bytes: Uint8Array): Promise<string> {
  const dir = scans();
  ensure(dir);
  const f = new File(dir, `${newId()}.jpg`);
  f.create();
  await f.write(bytes);
  return f.uri;
}

/** Throwaway files (previews) live in the cache, which the phone may clear at any time. */
export async function writePreview(bytes: Uint8Array): Promise<string> {
  const dir = cache('previews');
  ensure(dir);
  const f = new File(dir, `${newId()}.jpg`);
  f.create();
  await f.write(bytes);
  return f.uri;
}

export function removeFiles(uris: string[]) {
  for (const uri of uris) {
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch {
      // A file that is already gone is the outcome we wanted.
    }
  }
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ordo';
}

/** Writes an export (PDF, ZIP, Word, JPG) to the cache and returns its URI, ready for the share sheet. */
export async function writeExport(name: string, ext: string, bytes: Uint8Array): Promise<string> {
  const dir = cache('exports');
  ensure(dir);
  const file = new File(dir, `${safeFileName(name)}.${ext}`);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}

/** Exports and previews are throwaway copies, cleared when the app starts. */
export function clearTemporary() {
  for (const name of ['exports', 'previews']) {
    try {
      const dir = cache(name);
      if (dir.exists) dir.delete();
    } catch {
      // Not critical.
    }
  }
}

export function fileSize(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}
