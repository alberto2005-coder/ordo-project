import { Directory, File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { readBytes, safeFileName } from './files';

export type SaveResult = { status: 'ok'; count: number } | { status: 'cancelled' } | { status: 'denied' } | { status: 'error' };

/** What a file picker needs to know about the file we hand it. */
const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

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
    // Look at what is already there, so a second copy does not land on top of the first.
    const taken = new Set(dir.list().map((entry) => entry.name));
    let target = name;
    for (let i = 2; taken.has(target); i++) target = `${stem} (${i})${ext}`;
    // A folder chosen with the system dialog is a content:// tree, and there File.create()
    // is refused ("does not work with SAF content:// uris"). Directory.createFile is the way in.
    const file: File = dir.createFile(target, MIME[ext.toLowerCase()] ?? 'application/octet-stream');
    await file.write(await readBytes(uri));
    return { status: 'ok', count: 1 };
  } catch {
    return { status: 'error' };
  }
}
