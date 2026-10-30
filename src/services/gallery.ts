import * as ImagePicker from 'expo-image-picker';
import type { Filter, NewPage } from '@/data/library';
import { keepScan, removeFiles } from './files';
import { detectPageIn } from './detect';
import { PAGE_MAX_SIDE, renderPage } from './render';

export type PickResult = { status: 'ok'; pages: NewPage[] } | { status: 'cancelled' } | { status: 'error' };

/** Lets the person choose photos, copies them into the app, and applies the default filter if there is one.
 *  The untouched photo is always kept as the original so any edit can be undone. */
export async function importFromGallery(defaultFilter: Filter, onProgress?: (done: number, total: number) => void, autoCrop = false): Promise<PickResult> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 50,
      orderedSelection: true,
      quality: 1,
    });
  } catch {
    return { status: 'error' };
  }
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };

  const pages: NewPage[] = [];
  const created: string[] = [];
  try {
    for (let i = 0; i < picked.assets.length; i++) {
      onProgress?.(i, picked.assets.length);
      const original = await keepScan(picked.assets[i].uri);
      created.push(original);
      let processed = original;
      // Photos are not cut out like scanner pages, so look for the page and straighten it. The original stays untouched.
      const crop = autoCrop ? await detectPageIn(original) : null;
      if (defaultFilter !== 'original' || crop) {
        processed = await renderPage(original, { filter: defaultFilter, brightness: 0, contrast: 0, rotation: 0, crop }, { maxSide: PAGE_MAX_SIDE, persist: true });
        if (processed !== original) created.push(processed);
      }
      pages.push({ originalPath: original, processedPath: processed, filter: processed === original ? 'original' : defaultFilter, crop: crop ?? undefined });
    }
  } catch {
    // Do not leave a half-imported batch on disk.
    removeFiles(created);
    return { status: 'error' };
  }
  onProgress?.(picked.assets.length, picked.assets.length);
  return { status: 'ok', pages };
}
