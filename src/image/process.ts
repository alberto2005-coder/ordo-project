import jpeg from 'jpeg-js';
import { adjust, applyFilter, type Filter, type Pixels } from './pixels';

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
