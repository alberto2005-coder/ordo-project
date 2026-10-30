import { useEffect, useState, type ReactNode } from 'react';
import { getDb } from '@/data/expoDb';
import { getFolder, isDocumentLocked } from '@/data/folders';
import { isUnlocked } from '@/services/auth';
import { UnlockGate } from './UnlockGate';

/** Shows its children only when the document (or folder) is not locked, or has been unlocked in this visit. */
export function LockGuard({ docId, folderId, children }: { docId?: string; folderId?: string; children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const key = docId ?? folderId ?? '';

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await getDb();
      const locked = docId ? await isDocumentLocked(db, docId) : folderId ? !!(await getFolder(db, folderId))?.locked : false;
      if (alive) setState(locked && !isUnlocked(key) ? 'locked' : 'open');
    })();
    return () => {
      alive = false;
    };
  }, [docId, folderId, key]);

  if (state === 'checking') return null;
  if (state === 'locked') return <UnlockGate itemId={key} onUnlocked={() => setState('open')} />;
  return <>{children}</>;
}
