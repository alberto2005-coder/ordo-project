import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import { editJpegFull, isNoFullEdit, type FullEdit } from '@/image/process';
import { readBytes, writePreview, writeScanBytes } from './files';

export type PageEditInput = FullEdit;

/** Long side of the saved page image. About A4 at 200 dpi, which keeps text sharp without huge files. */
export const PAGE_MAX_SIDE = 2000;
export const PREVIEW_MAX_SIDE = 640;

function sizeOf(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

/** Makes the edited picture from the untouched original: shrink to a sensible size, crop and straighten, rotate, then filter.
 *  Returns the original's own URI when nothing needs to change. `persist` keeps the result in the app
 *  folder; otherwise it goes to the cache as a preview. */
export async function renderPage(originalUri: string, edit: PageEditInput, opts: { maxSide: number; persist: boolean }): Promise<string> {
  const actions: ImageManipulator.Action[] = [];
  const { width, height } = await sizeOf(originalUri);
  if (Math.max(width, height) > opts.maxSide) {
    actions.push({ resize: width >= height ? { width: opts.maxSide } : { height: opts.maxSide } });
  }
  const untouched = !actions.length && isNoFullEdit(edit);
  if (untouched && opts.persist) return originalUri;

  const shrunk = actions.length
    ? await ImageManipulator.manipulateAsync(originalUri, actions, { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG })
    : { uri: originalUri };
  let bytes = await readBytes(shrunk.uri);
  bytes = editJpegFull(bytes, edit, 88, opts.maxSide);
  return opts.persist ? writeScanBytes(bytes) : writePreview(bytes);
}
