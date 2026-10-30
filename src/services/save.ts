import { Directory, File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { readBytes, safeFileName } from './files';

export type SaveResult = { status: 'ok'; count: number } | { status: 'cancelled' } | { status: 'denied' } | { status: 'error' };

/** Puts image files in the phone's photo gallery. Asks only for permission to add, not to read the gallery. */
export async function saveToGallery(uris: string[]): Promise<SaveResult> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return { status: 'denied' };
    for (const u of uris) await MediaLibrary.saveToLibraryAsync(u);
    return { status: 'ok', count: uris.length };
  } catch {
    return { status: 'error' };
  }
}

/** Copies a file into a folder the person picks (Files on iOS, any storage folder on Android). */
export async function saveToFolder(uri: string, fileName: string): Promise<SaveResult> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return { status: 'cancelled' };
  }
  try {
    const name = safeFileName(fileName);
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const stem = ext ? name.slice(0, -ext.length) : name;
    let target = new File(dir, name);
    for (let i = 2; target.exists; i++) target = new File(dir, `${stem} (${i})${ext}`);
    target.create();
    await target.write(await readBytes(uri));
    return { status: 'ok', count: 1 };
  } catch {
    return { status: 'error' };
  }
}
