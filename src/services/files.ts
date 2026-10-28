import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '@/data/library';

/** Everything the app stores lives in its own private folder. */
const scans = () => new Directory(Paths.document, 'scans');
const exports_ = () => new Directory(Paths.cache, 'exports');

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

/** The scanner leaves its images in a temporary place. Copy them to the app folder so they survive. */
export async function keepScan(tempUri: string): Promise<string> {
  const dir = scans();
  ensure(dir);
  const target = new File(dir, `${newId()}.jpg`);
  await new File(tempUri).copy(target);
  return target.uri;
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

/** Writes a finished PDF to the cache and returns its URI, ready for the share sheet. */
export async function writeExport(name: string, bytes: Uint8Array): Promise<string> {
  const dir = exports_();
  ensure(dir);
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ordo';
  const file = new File(dir, `${safe}.pdf`);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}

/** Old exports are throwaway copies. Called on app start. */
export function clearExports() {
  try {
    const dir = exports_();
    if (dir.exists) dir.delete();
  } catch {
    // Not critical.
  }
}
