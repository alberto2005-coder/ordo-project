import { zipSync } from 'fflate';

export interface NamedFile {
  name: string;
  bytes: Uint8Array;
}

/** Makes names safe for a zip and unique, keeping the extension. "Factura/1.jpg" -> "Factura 1.jpg". */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const clean = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'file';
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    let name = clean;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem} (${i})${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** JPEGs are already compressed, so they are stored as they are (fast, and the size does not change). */
export function zipFiles(files: NamedFile[]): Uint8Array {
  if (!files.length) throw new Error('nothing to zip');
  const names = uniqueNames(files.map((f) => f.name));
  const entries: Record<string, Uint8Array> = {};
  files.forEach((f, i) => {
    entries[names[i]] = f.bytes;
  });
  return zipSync(entries, { level: 0 });
}
