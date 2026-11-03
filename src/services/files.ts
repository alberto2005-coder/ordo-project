import { Directory, File, Paths } from 'expo-file-system';
import { newId } from '@/data/library';

/** Everything the app keeps lives in its own private folder. */
const scans = () => new Directory(Paths.document, 'scans');
const cache = (name: string) => new Directory(Paths.cache, name);

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true });
}

/** The extension that matches what the bytes really are. Photos can arrive as PNG, HEIC or WebP. */
function extensionOf(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57) return 'webp';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'heic';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  return 'jpg';
}

/** The scanner and the photo picker leave images in a temporary place. Copy them into the app folder so they survive. */
export async function keepScan(tempUri: string): Promise<string> {
  const dir = scans();
  ensure(dir);
  const source = new File(tempUri);
  const ext = extensionOf(await source.bytes());
  const target = new File(dir, `${newId()}.${ext}`);
  await source.copy(target);
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

/** Shared exports are plain files: the copies are dropped as soon as the person comes back to the app. */
export function clearExports() {
  try {
    const dir = cache('exports');
    if (dir.exists) dir.delete();
  } catch {
    // Not critical.
  }
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
