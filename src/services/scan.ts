import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';
import { keepScan, removeFiles } from './files';

export type ScanResult =
  | { status: 'ok'; paths: string[] }
  | { status: 'cancelled' }
  | { status: 'error' };

/** Opens the phone's own document scanner (edge detection, crop and flattening included)
 *  and keeps the resulting pages in the app's private folder. */
export async function scanPages(maxPages?: number): Promise<ScanResult> {
  let response;
  try {
    response = await DocumentScanner.scanDocument({ croppedImageQuality: 90, ...(maxPages ? { maxNumDocuments: maxPages } : {}) });
  } catch {
    return { status: 'error' };
  }
  if (response.status === ScanDocumentResponseStatus.Cancel) return { status: 'cancelled' };
  const temp = response.scannedImages ?? [];
  if (!temp.length) return { status: 'cancelled' };

  const kept: string[] = [];
  try {
    for (const uri of temp) kept.push(await keepScan(uri));
  } catch {
    // Disk full or similar: do not leave half a document behind.
    removeFiles(kept);
    return { status: 'error' };
  }
  return { status: 'ok', paths: kept };
}
