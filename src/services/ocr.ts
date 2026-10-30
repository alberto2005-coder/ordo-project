import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

export type OcrResult = { ok: true; text: string } | { ok: false };

/** Reads the text in a page image on the phone, with no network. Latin by default; Chinese, Japanese,
 *  Korean and Devanagari can be chosen. Arabic and Cyrillic are not covered. */
export type OcrScript = 'latin' | 'chinese' | 'japanese' | 'korean' | 'devanagari';
const SCRIPTS: Record<OcrScript, TextRecognitionScript> = {
  latin: TextRecognitionScript.LATIN,
  chinese: TextRecognitionScript.CHINESE,
  japanese: TextRecognitionScript.JAPANESE,
  korean: TextRecognitionScript.KOREAN,
  devanagari: TextRecognitionScript.DEVANAGARI,
};

export async function recognizeText(uri: string, script: OcrScript = 'latin'): Promise<OcrResult> {
  try {
    const result = await TextRecognition.recognize(uri, SCRIPTS[script]);
    return { ok: true, text: (result.text ?? '').trim() };
  } catch {
    return { ok: false };
  }
}
