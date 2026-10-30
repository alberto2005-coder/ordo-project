import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { getDb } from '@/data/expoDb';
import { t, useLang } from '@/i18n';
import { createBackupFile, restoreBackupFile } from '@/services/backupFiles';
import { canShare, shareFile } from '@/services/exportPdf';
import { saveToFolder } from '@/services/save';
import { useTheme } from '@/theme/ThemeProvider';

export default function BackupScreen() {
  const { colors } = useTheme();
  useLang();
  const [busy, setBusy] = useState(false);

  async function create(mode: 'share' | 'folder') {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createBackupFile(await getDb());
      if (r.status === 'empty') return void Alert.alert(t('backup.empty'));
      if (r.status !== 'ok') return void Alert.alert(t('backup.failed'));
      if (mode === 'share') {
        if (!(await canShare())) return void Alert.alert(t('export.noShare'));
        await shareFile({ uri: r.uri, mime: 'application/zip', uti: 'public.zip-archive' });
      } else {
        const s = await saveToFolder(r.uri, decodeURIComponent(r.uri.split('/').pop() ?? 'Ordo backup.zip'));
        if (s.status === 'ok') Alert.alert(t('export.saved'));
        else if (s.status === 'error') Alert.alert(t('export.saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await restoreBackupFile(await getDb());
      if (r.status === 'error') Alert.alert(t('backup.restoreFailed'));
      else if (r.status === 'ok') Alert.alert(r.skippedPages ? t('backup.restoredSkipped', { n: r.documents, s: r.skippedPages }) : t('backup.restored', { n: r.documents }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('backup.title') }} />
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Text style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20 }}>{t('backup.note')}</Text>
        <Button label={t('export.share')} loading={busy} onPress={() => void create('share')} />
        <Button label={t('export.saveFolder')} variant="secondary" disabled={busy} onPress={() => void create('folder')} />
        <Text style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20, marginTop: 12 }}>{t('backup.restoreNote')}</Text>
        <Button label={t('backup.restore')} variant="secondary" disabled={busy} onPress={() => void restore()} />
      </ScrollView>
    </Screen>
  );
}
