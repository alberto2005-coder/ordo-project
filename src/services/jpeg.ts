import * as ImageManipulator from 'expo-image-manipulator';
import { readBytes } from './files';

/** True when the bytes really are a JPEG (they start with the FF D8 FF marker). */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Reads a picture as JPEG bytes. Photos from the gallery can be PNG, HEIC or WebP, but the pixel code
 *  in src/image only understands JPEG, so anything else is converted on the phone first. */
export async function readJpegBytes(uri: string, compress = 0.95): Promise<Uint8Array> {
  const bytes = await readBytes(uri);
  if (isJpeg(bytes)) return bytes;
  const out = await ImageManipulator.manipulateAsync(uri, [], { compress, format: ImageManipulator.SaveFormat.JPEG });
  return readBytes(out.uri);
}
