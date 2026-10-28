import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { EmptyState, Screen } from '@/components/Screen';
import { getDb } from '@/data/expoDb';
import { deleteDocument, getDocument, renameDocument, type DocumentRow, type PageRow } from '@/data/library';
import { t, useLang } from '@/i18n';
import { canShare, exportDocumentPdf, sharePdf } from '@/services/exportPdf';
import { removeFiles } from '@/services/files';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, radius, layout } = useTheme();
  useLang();
  const settings = useApp((s) => s.settings);
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const got = await getDocument(db, id);
    if (!got) {
      setMissing(true);
      return;
    }
    setDoc(got.doc);
    setPages(got.pages);
    setTitle(got.doc.title);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveTitle() {
    const clean = title.trim();
    if (!doc || !clean || clean === doc.title) {
      if (doc) setTitle(doc.title);
      return;
    }
    const db = await getDb();
    await renameDocument(db, doc.id, clean);
    setDoc({ ...doc, title: clean.slice(0, 200) });
  }

  async function share() {
    if (!doc || !settings || exporting) return;
    if (!(await canShare())) {
      Alert.alert(t('export.noShare'));
      return;
    }
    setExporting(true);
    try {
      const db = await getDb();
      const out = await exportDocumentPdf(db, doc.id, {
        quality: settings.export_quality,
        pageSize: settings.pdf_page_size,
      });
      if (out.status !== 'ok') {
        Alert.alert(t('export.failed'));
        return;
      }
      await sharePdf(out.uri);
    } catch {
      Alert.alert(t('export.failed'));
    } finally {
      setExporting(false);
    }
  }

  function confirmDelete() {
    if (!doc) return;
    Alert.alert(t('doc.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('doc.delete'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          const files = await deleteDocument(db, doc.id);
          removeFiles(files);
          router.back();
        },
      },
    ]);
  }

  if (missing) {
    return (
      <Screen>
        <EmptyState icon={<View />} text={t('error.generic')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={saveTitle}
        onSubmitEditing={saveTitle}
        maxLength={200}
        accessibilityLabel={t('doc.rename')}
        returnKeyType="done"
        style={[styles.title, { color: colors.text, borderColor: colors.border, minHeight: layout['tap-target'], borderRadius: radius.md }]}
      />
      {pages.length === 0 ? (
        <EmptyState icon={<View />} text={t('doc.noPages')} />
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
          renderItem={({ item, index }) => (
            <View style={[styles.page, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <Image
                source={{ uri: item.processed_path }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel={`${doc?.title ?? ''} ${index + 1}/${pages.length}`}
              />
              <Text style={[styles.pageNo, { color: colors['text-muted'] }]}>{index + 1} / {pages.length}</Text>
            </View>
          )}
        />
      )}
      <View style={styles.actions}>
        <Button
          label={exporting ? t('doc.exporting') : t('doc.share')}
          onPress={share}
          loading={exporting}
          disabled={!pages.length}
        />
        <Button label={t('doc.delete')} onPress={confirmDelete} variant="ghost" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, lineHeight: 28, fontWeight: '600', borderWidth: 1, paddingHorizontal: 12 },
  page: { padding: 8, alignItems: 'center' },
  image: { width: '100%', aspectRatio: 0.72 },
  pageNo: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  actions: { gap: 8, paddingTop: 8 },
});
