import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import type { Db } from '@/data/db';
import { isDocumentLocked } from '@/data/folders';
import { PinVault, type KeyValue } from '@/security/pin';

const store: KeyValue = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  delete: (k) => SecureStore.deleteItemAsync(k),
};

export const vault = new PinVault(store);

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function askBiometrics(prompt: string, cancel: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: cancel, disableDeviceFallback: true });
    return r.success;
  } catch {
    return false;
  }
}

/** Items unlocked during this visit. Everything locks again when the app goes to the background. */
const unlocked = new Set<string>();
export const isUnlocked = (id: string) => unlocked.has(id);
export const markUnlocked = (id: string) => void unlocked.add(id);
export const lockAll = () => unlocked.clear();

/** True when a document may be changed: it is not locked, or it was unlocked in this visit.
 *  Screens are not the only way in (deep links, the camera, imports), so the check lives here too. */
export async function canModifyDocument(db: Db, id: string): Promise<boolean> {
  return !(await isDocumentLocked(db, id)) || isUnlocked(id);
}

AppState.addEventListener('change', (s) => {
  if (s !== 'active') lockAll();
});
