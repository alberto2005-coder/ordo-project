import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { getDb } from '@/data/expoDb';
import { getFolder, isDocumentLocked } from '@/data/folders';
import { isUnlocked, lockAll } from '@/services/auth';
import { UnlockGate } from './UnlockGate';

/** Shows its children only when the document (or folder) is not locked, or has been unlocked in this visit.
 *  Leaving the app forgets every unlock, so a document that was open on screen asks for the PIN again. */
export function LockGuard({ docId, folderId, children }: { docId?: string; folderId?: string; children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  // Bumped when the app goes away, so the check below runs again with the unlocks already forgotten.
  const [visit, setVisit] = useState(0);
  const key = docId ?? folderId ?? '';

  useEffect(() => {
    let alive = true;
    setState('checking');
    (async () => {
      const db = await getDb();
      const locked = docId ? await isDocumentLocked(db, docId) : folderId ? !!(await getFolder(db, folderId))?.locked : false;
      if (alive) setState(locked && !isUnlocked(key) ? 'locked' : 'open');
    })();
    return () => {
      alive = false;
    };
  }, [docId, folderId, key, visit]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') return;
      lockAll();
      setVisit((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  if (state === 'checking') return null;
  if (state === 'locked') return <UnlockGate itemId={key} onUnlocked={() => setState('open')} />;
  return <>{children}</>;
}
