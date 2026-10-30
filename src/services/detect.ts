import * as ImageManipulator from 'expo-image-manipulator';
import { decodeJpeg } from '@/image/process';
import { detectPage } from '@/image/detectPage';
import { isFullPage, type Corners } from '@/image/warp';
import { readBytes } from './files';

/** Looks for the page in a photo on the phone. Works on a small copy, so it is quick and light on memory.
 *  The corners returned are fractions, so they fit the full-size photo too. Null means nothing convincing was found. */
export async function detectPageIn(uri: string): Promise<Corners | null> {
  try {
    const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 480 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
    const found = detectPage(decodeJpeg(await readBytes(small.uri)));
    return found && !isFullPage(found.corners) ? found.corners : null;
  } catch {
    return null;
  }
}
