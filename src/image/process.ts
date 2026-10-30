import jpeg from 'jpeg-js';
import { adjust, applyFilter, type Filter, type Pixels } from './pixels';
import { isFullPage, rotate, warpPerspective, type Corners } from './warp';

export interface Edit {
  filter: Filter;
  brightness: number; // -1..1
  contrast: number; // -1..1
}

export const NO_EDIT: Edit = { filter: 'original', brightness: 0, contrast: 0 };

export function isNoEdit(e: Edit): boolean {
  return e.filter === 'original' && e.brightness === 0 && e.contrast === 0;
}

export function decodeJpeg(bytes: Uint8Array): Pixels {
  const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength) };
}

export function encodeJpeg(img: Pixels, quality = 85): Uint8Array {
  const out = jpeg.encode(
    { data: img.data as unknown as Uint8Array, width: img.width, height: img.height },
    quality,
  );
  return new Uint8Array(out.data);
}

/** Applies the filter and the sliders to a JPEG. With no edit it returns the bytes untouched
 *  (no decode, no quality loss, no time spent). */
export function editJpeg(bytes: Uint8Array, edit: Edit, quality = 85): Uint8Array {
  if (isNoEdit(edit)) return bytes;
  let px = decodeJpeg(bytes);
  px = applyFilter(px, edit.filter);
  if (edit.brightness !== 0 || edit.contrast !== 0) px = adjust(px, edit.brightness, edit.contrast);
  return encodeJpeg(px, quality);
}

export interface FullEdit extends Edit {
  rotation: 0 | 90 | 180 | 270;
  /** Four corners of the page inside the picture; null or the whole picture means no crop. */
  crop?: Corners | null;
}

export function isNoFullEdit(e: FullEdit): boolean {
  return isNoEdit(e) && !e.rotation && isFullPage(e.crop);
}

/** Crop and straighten, then rotate, then filter and sliders. With no edit the bytes come back untouched. */
export function editJpegFull(bytes: Uint8Array, edit: FullEdit, quality = 88, maxSide = 2000): Uint8Array {
  if (isNoFullEdit(edit)) return bytes;
  let px = decodeJpeg(bytes);
  if (!isFullPage(edit.crop)) px = warpPerspective(px, edit.crop as Corners, maxSide);
  px = rotate(px, edit.rotation);
  px = applyFilter(px, edit.filter);
  if (edit.brightness !== 0 || edit.contrast !== 0) px = adjust(px, edit.brightness, edit.contrast);
  return encodeJpeg(px, quality);
}
