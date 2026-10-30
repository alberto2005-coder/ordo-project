import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Chip, PromptModal } from '@/components/ui';
import { clearAllLocks } from '@/data/folders';
import { getDb } from '@/data/expoDb';
import { t, useLang } from '@/i18n';
import { biometricsAvailable, lockAll, vault } from '@/services/auth';
import { isValidPin } from '@/security/pin';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

type Step = null | 'new' | 'current-change' | 'new-change' | 'current-remove';

export default function LockSettings() {
  const { colors } = useTheme();
  useLang();
  const settings = useApp((s) => s.settings);
  const change = useApp((s) => s.change);
  const [hasPin, setHasPin] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [current, setCurrent] = useState('');

  const refresh = useCallback(async () => setHasPin(await vault.hasPin()), []);
  useEffect(() => void refresh(), [refresh]);

  async function onSubmit(value: string) {
    const v = value.trim();
    const s = step;
    setStep(null);
    if (s === 'new') {
      if (!isValidPin(v)) return void Alert.alert(t('lock.pinInvalid'));
      await vault.setPin(v);
      Alert.alert(t('lock.pinSet'));
    } else if (s === 'current-change') {
      setCurrent(v);
      setTimeout(() => setStep('new-change'), 0);
      return;
    } else if (s === 'new-change') {
      if (!isValidPin(v)) return void Alert.alert(t('lock.pinInvalid'));
      const r = await vault.changePin(current, v);
      setCurrent('');
      Alert.alert(r.ok ? t('lock.pinSet') : r.reason === 'locked' ? t('lock.tryAgainIn', { sec: Math.ceil(r.retryInMs / 1000) }) : t('lock.wrongCurrent'));
    } else if (s === 'current-remove') {
      const r = await vault.removePin(v);
      if (!r.ok) return void Alert.alert(r.reason === 'locked' ? t('lock.tryAgainIn', { sec: Math.ceil(r.retryInMs / 1000) }) : t('lock.wrongCurrent'));
      await clearAllLocks(await getDb());
      await change({ biometrics_lock: 0 });
      lockAll();
      Alert.alert(t('lock.pinRemoved'));
    }
    await refresh();
  }

  async function toggleBiometrics() {
    if (!settings) return;
    if (!settings.biometrics_lock && !(await biometricsAvailable())) return void Alert.alert(t('lock.biometricsNone'));
    await change({ biometrics_lock: settings.biometrics_lock ? 0 : 1 });
  }

  const title = step === 'current-change' || step === 'current-remove' ? t('lock.pinCurrent') : step === 'new-change' ? t('lock.pinNew') : t('lock.pinPrompt');

  return (
    <Screen>
      <Stack.Screen options={{ title: t('lock.title') }} />
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Text style={[styles.status, { color: colors.text }]}>{hasPin ? t('lock.enabled') : t('lock.disabled')}</Text>
        {hasPin ? (
          <>
            <Button label={t('lock.changePin')} variant="secondary" onPress={() => setStep('current-change')} />
            <Button label={t('lock.removePin')} variant="ghost" onPress={() => setStep('current-remove')} />
            <Chip radio={false} label={t('lock.biometrics')} selected={settings?.biometrics_lock === 1} onPress={() => void toggleBiometrics()} />
          </>
        ) : (
          <Button label={t('lock.setPin')} onPress={() => setStep('new')} />
        )}
        <Text style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20 }}>{t('lock.note')}</Text>
      </ScrollView>
      <PromptModal visible={step !== null} title={title} secure keyboardType="number-pad" maxLength={8} onSubmit={(v) => void onSubmit(v)} onCancel={() => setStep(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ status: { fontSize: 20, fontWeight: '600' } });
