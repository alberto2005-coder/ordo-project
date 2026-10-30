import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import type { Filter, NewPage } from '@/data/library';
import { splitSpread } from '@/image/book';
import { composeIdSheet } from '@/image/idCard';
import { decodeJpeg, encodeJpeg } from '@/image/process';
import type { Corners } from '@/image/warp';
import { detectPageIn } from './detect';
import { keepScan, readBytes, removeFiles, writeScanBytes } from './files';
import { PAGE_MAX_SIDE, renderPage } from './render';

export type CaptureMode = 'doc' | 'receipt' | 'book' | 'id';
export interface CaptureConfig {
  /** Filter for ordinary documents. Receipts and books always use "enhanced". */
  filter: Filter;
  /** Look for the page in the photo and straighten it. Scanner pages are already cut out. */
  detect: boolean;
}

const SPREAD_MAX_SIDE = 2400;

const sizeOf = (uri: string) => new Promise<{ width: number; height: number }>((res, rej) => Image.getSize(uri, (width, height) => res({ width, height }), rej));

/** A kept file holding the photo cut to the page (when there is one to find), at a sensible size. */
async function cutOut(original: string, detect: boolean, maxSide: number): Promise<{ uri: string; crop: Corners | null }> {
  const crop = detect ? await detectPageIn(original) : null;
  const uri = await renderPage(original, { filter: 'original', brightness: 0, contrast: 0, rotation: 0, crop }, { maxSide, persist: true });
  return { uri, crop };
}

/** Splits a photo of two facing pages into two kept files. */
async function splitBook(uri: string): Promise<[string, string]> {
  const { width, height } = await sizeOf(uri);
  const resized = Math.max(width, height) > SPREAD_MAX_SIDE
    ? (await ImageManipulator.manipulateAsync(uri, [{ resize: width >= height ? { width: SPREAD_MAX_SIDE } : { height: SPREAD_MAX_SIDE } }], { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 })).uri
    : uri;
  const [left, right] = splitSpread(decodeJpeg(await readBytes(resized)));
  const a = await writeScanBytes(encodeJpeg(left, 92));
  try {
    return [a, await writeScanBytes(encodeJpeg(right, 92))];
  } catch (e) {
    removeFiles([a]);
    throw e;
  }
}

async function page(original: string, filter: Filter): Promise<NewPage> {
  if (filter === 'original') return { originalPath: original };
  const processed = await renderPage(original, { filter, brightness: 0, contrast: 0, rotation: 0 }, { maxSide: PAGE_MAX_SIDE, persist: true });
  return { originalPath: original, processedPath: processed, filter: processed === original ? 'original' : filter };
}

/** Turns pictures into pages for the chosen mode. `fromScanner` pictures are already cut out by the phone's scanner,
 *  so they are not searched for a page. All files made along the way are removed if something fails.
 *  The caller owns the input files (they are kept on success and removed by the caller on failure). */
export async function buildPages(inputs: string[], mode: CaptureMode, cfg: CaptureConfig, fromScanner: boolean): Promise<NewPage[]> {
  const made: string[] = [];
  const keep = async (u: string) => {
    const k = await keepScan(u);
    made.push(k);
    return k;
  };
  try {
    if (mode === 'id') {
      const pics: string[] = [];
      for (const u of inputs.slice(0, 2)) {
        const kept = await keep(u);
        const cut = await cutOut(kept, cfg.detect && !fromScanner, PAGE_MAX_SIDE);
        if (cut.uri !== kept) made.push(cut.uri);
        pics.push(cut.uri);
      }
      const sheet = composeIdSheet(decodeJpeg(await readBytes(pics[0])), pics[1] ? decodeJpeg(await readBytes(pics[1])) : null);
      const path = await writeScanBytes(encodeJpeg(sheet, 90));
      removeFiles(made);
      return [{ originalPath: path }];
    }
    const pages: NewPage[] = [];
    for (const u of inputs) {
      const kept = await keep(u);
      if (mode === 'book') {
        const cut = await cutOut(kept, cfg.detect && !fromScanner, SPREAD_MAX_SIDE);
        if (cut.uri !== kept) made.push(cut.uri);
        const halves = await splitBook(cut.uri);
        made.push(...halves);
        for (const h of halves) pages.push(await page(h, 'enhanced'));
        // The cut-out and the untouched photo are not pages any more.
        removeFiles([kept, ...(cut.uri !== kept ? [cut.uri] : [])]);
        continue;
      }
      const filter: Filter = mode === 'receipt' ? 'enhanced' : cfg.filter;
      const crop = cfg.detect && !fromScanner ? await detectPageIn(kept) : null;
      if (crop || filter !== 'original') {
        const processed = await renderPage(kept, { filter, brightness: 0, contrast: 0, rotation: 0, crop }, { maxSide: PAGE_MAX_SIDE, persist: true });
        if (processed !== kept) made.push(processed);
        pages.push({ originalPath: kept, processedPath: processed, filter: processed === kept ? 'original' : filter, crop: crop ?? undefined });
      } else pages.push({ originalPath: kept });
    }
    return pages;
  } catch (e) {
    removeFiles(made);
    throw e;
  }
}
