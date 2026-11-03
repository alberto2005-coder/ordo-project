import { Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { t } from '@/i18n';
import { askBiometrics, biometricsAvailable, markUnlocked, vault } from '@/services/auth';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { EmptyState, Screen } from './Screen';
import { PromptModal } from './ui';

/** Shown instead of a locked document or folder until the person proves who they are. */
export function UnlockGate({ itemId, onUnlocked }: { itemId: string; onUnlocked: () => void }) {
  const { colors } = useTheme();
  const biometrics = useApp((s) => s.settings?.biometrics_lock === 1);
  const [askPin, setAskPin] = useState(false);
  const tried = useRef(false);

  const finish = useCallback(() => {
    markUnlocked(itemId);
    onUnlocked();
  }, [itemId, onUnlocked]);

  const tryBiometrics = useCallback(async () => {
    if (!(await biometricsAvailable())) return false;
    if (await askBiometrics(t('lock.biometricPrompt'), t('common.cancel'))) {
      finish();
      return true;
    }
    return false;
  }, [finish]);

  useEffect(() => {
    if (biometrics && !tried.current) {
      tried.current = true;
      void tryBiometrics();
    }
  }, [biometrics, tryBiometrics]);

  async function submitPin(pin: string) {
    setAskPin(false);
    const r = await vault.verify(pin.trim());
    if (r.ok) return finish();
    if (r.reason === 'locked') Alert.alert(t('lock.tryAgainIn', { sec: Math.ceil(r.retryInMs / 1000) }));
    else if (r.reason === 'wrong') Alert.alert(t('lock.attemptsLeft', { n: r.attemptsLeft }));
    // A missing PIN record must not become a way in: what is locked stays locked until a new PIN is created.
    else Alert.alert(t('lock.noPinStored'), t('lock.noPinStoredMsg'));
  }

  return (
    <Screen>
      <EmptyState
        icon={<Lock size={48} color={colors['text-muted']} />}
        text={t('lock.unlockTitle')}
        action={
          <>
            <Button label={t('lock.unlockWithPin')} onPress={() => setAskPin(true)} />
            {biometrics ? <Button label={t('lock.biometrics')} variant="secondary" onPress={() => void tryBiometrics()} /> : null}
          </>
        }
      />
      <PromptModal
        visible={askPin}
        title={t('lock.unlockPrompt')}
        secure
        keyboardType="number-pad"
        maxLength={8}
        onSubmit={(v) => void submitPin(v)}
        onCancel={() => setAskPin(false)}
      />
    </Screen>
  );
}
