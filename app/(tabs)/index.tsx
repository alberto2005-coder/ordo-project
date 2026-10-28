import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { FileText, Plus, Search } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState, Screen } from '@/components/Screen';
import { createDocument, listDocuments, type DocumentSummary } from '@/data/library';
import { getDb } from '@/data/expoDb';
import { t, useLang } from '@/i18n';
import { removeFiles } from '@/services/files';
import { scanPages } from '@/services/scan';
import { useTheme } from '@/theme/ThemeProvider';

export default function Library() {
  const router = useRouter();
  const { colors, radius, layout } = useTheme();
  const lang = useLang();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const db = await getDb();
    setDocs(await listDocuments(db, { query }));
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function newScan() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await scanPages();
      if (result.status === 'error') {
        Alert.alert(t('scan.failed'));
        return;
      }
      if (result.status !== 'ok') return;
      const db = await getDb();
      try {
        const date = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB');
        const id = await createDocument(db, {
          title: t('doc.untitled', { date }),
          pages: result.paths.map((p) => ({ originalPath: p })),
        });
        router.push(`/document/${id}`);
      } catch {
        removeFiles(result.paths);
        Alert.alert(t('error.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={[styles.search, { backgroundColor: colors.surface, borderRadius: radius.pill, minHeight: layout['tap-target'] }]}>
        <Search size={20} color={colors['text-muted']} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={t('library.search')}
          placeholderTextColor={colors['text-muted']}
          accessibilityLabel={t('library.search')}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>

      {docs === null ? null : docs.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} color={colors['text-muted']} />}
          text={query ? t('library.noResults') : t('library.empty')}
        />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingBottom: 96 }}
          renderItem={({ item }) => {
            const pages = item.page_count === 1 ? t('doc.page') : t('doc.pages', { n: item.page_count });
            return (
              <Pressable
                style={[styles.card, { backgroundColor: colors['surface-raised'], borderColor: colors.border, borderRadius: radius.md }]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${pages}`}
                onPress={() => router.push(`/document/${item.id}`)}
              >
                <View style={[styles.thumb, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
                  {item.thumbnail_path ? (
                    <Image source={{ uri: item.thumbnail_path }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : null}
                </View>
                <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{item.title}</Text>
                <Text style={[styles.meta, { color: colors['text-muted'] }]}>{pages}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('action.newScan')}
        accessibilityState={{ busy }}
        onPress={newScan}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.accent, opacity: pressed || busy ? 0.8 : 1 }]}
      >
        <Plus size={28} color={colors['on-accent']} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
  card: { flex: 1, borderWidth: 1, padding: 12, gap: 4 },
  thumb: { height: 120, overflow: 'hidden', marginBottom: 4 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  meta: { fontSize: 14, lineHeight: 20 },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
