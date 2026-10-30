import { Stack, useFocusEffect } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { EmptyState, Screen } from '@/components/Screen';
import { getDb } from '@/data/expoDb';
import { listDocuments, type DocumentSummary } from '@/data/library';
import { emptyTrash, purgeDocuments, restoreDocuments, TRASH_DAYS } from '@/data/trash';
import { t, useLang } from '@/i18n';
import { removeFiles } from '@/services/files';
import { useTheme } from '@/theme/ThemeProvider';

export default function TrashScreen() {
  const { colors, radius } = useTheme();
  useLang();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);

  const load = useCallback(async () => setDocs(await listDocuments(await getDb(), { trashed: true })), []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const daysLeft = (d: DocumentSummary) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(d.deleted_at ?? Date.now()).getTime()) / 86_400_000));

  async function restore(d: DocumentSummary) {
    await restoreDocuments(await getDb(), [d.id]);
    await load();
  }

  function forever(d?: DocumentSummary) {
    Alert.alert(d ? t('trash.deleteOne') : t('trash.emptyConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trash.deleteForever'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          removeFiles(d ? await purgeDocuments(db, [d.id]) : await emptyTrash(db));
          await load();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('trash.title') }} />
      {docs === null ? null : docs.length === 0 ? (
        <EmptyState icon={<Trash2 size={48} color={colors['text-muted']} />} text={t('trash.empty')} />
      ) : (
        <>
          <Text style={{ color: colors['text-muted'], fontSize: 14, marginBottom: 8 }}>{t('trash.note', { n: TRASH_DAYS })}</Text>
          <FlatList
            data={docs}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
            renderItem={({ item }) => (
              <View style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
                  <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('trash.daysLeft', { n: daysLeft(item) })}</Text>
                </View>
                <Button label={t('trash.restore')} variant="secondary" onPress={() => void restore(item)} />
                <Button label={t('trash.deleteForever')} variant="ghost" onPress={() => forever(item)} />
              </View>
            )}
          />
          <Button label={t('trash.emptyAll')} variant="danger" onPress={() => forever()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, flexWrap: 'wrap' } });
