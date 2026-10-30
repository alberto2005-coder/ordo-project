import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Chip, PromptModal, SectionTitle } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { listDocuments, type DocumentSummary } from '@/data/library';
import { mergeDocuments } from '@/data/pageOps';
import { t, useLang } from '@/i18n';
import { canShare, exportDocumentPdf, formatSize, shareFile } from '@/services/exportPdf';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Tools() {
  const router = useRouter();
  const { colors } = useTheme();
  useLang();
  const settings = useApp((s) => s.settings);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [hidden, setHidden] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [deleteSrc, setDeleteSrc] = useState(false);
  const [naming, setNaming] = useState(false);
  const [compressId, setCompressId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const all = await listDocuments(await getDb());
        // Locked documents stay out: merging or compressing would show their content without unlocking.
        setHidden(all.some((d) => d.is_locked));
        setDocs(all.filter((d) => !d.is_locked));
        setOrder([]);
        setCompressId(null);
      })();
    }, []),
  );

  const toggleMerge = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  async function merge(title: string) {
    setNaming(false);
    try {
      const id = await mergeDocuments(await getDb(), order, title, { deleteSources: deleteSrc });
      Alert.alert(t('tools.mergeDone'));
      setOrder([]);
      router.push(`/document/${id}`);
    } catch {
      Alert.alert(t('error.generic'));
    }
  }

  async function compress() {
    if (!compressId || !settings || busy) return;
    if (!(await canShare())) return void Alert.alert(t('export.noShare'));
    setBusy(true);
    setResult(null);
    try {
      const out = await exportDocumentPdf(await getDb(), compressId, { quality: 'low', pageSize: settings.pdf_page_size });
      if (out.status !== 'ok') return void Alert.alert(t('export.failed'));
      setResult(t('tools.compressResult', { size: formatSize(out.size) }));
      await shareFile(out);
    } catch {
      Alert.alert(t('export.failed'));
    } finally {
      setBusy(false);
    }
  }

  const pageText = (d: DocumentSummary) => (d.page_count === 1 ? t('doc.page') : t('doc.pages', { n: d.page_count }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        {hidden ? <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.lockedHidden')}</Text> : null}

        <SectionTitle>{t('tools.merge')}</SectionTitle>
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.mergeHint')}</Text>
        {docs.length === 0 ? <Text style={{ color: colors['text-muted'] }}>{t('tools.none')}</Text> : null}
        <View style={styles.wrap} accessibilityRole="list">
          {docs.map((d) => {
            const n = order.indexOf(d.id);
            return <Chip key={d.id} radio={false} label={`${n >= 0 ? `${n + 1}. ` : ''}${d.title} (${pageText(d)})`} selected={n >= 0} onPress={() => toggleMerge(d.id)} />;
          })}
        </View>
        {order.length > 0 ? <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.selected', { n: order.length })}</Text> : null}
        <Chip radio={false} label={t('tools.mergeDeleteSrc')} selected={deleteSrc} onPress={() => setDeleteSrc((v) => !v)} />
        <Button label={t('tools.mergeDo')} disabled={order.length < 2} onPress={() => setNaming(true)} />

        <SectionTitle>{t('tools.compress')}</SectionTitle>
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.compressHint')}</Text>
        <View style={styles.wrap}>
          {docs.map((d) => (
            <Chip key={d.id} label={d.title} selected={compressId === d.id} onPress={() => setCompressId(d.id)} />
          ))}
        </View>
        <Button label={t('tools.compressDo')} disabled={!compressId} loading={busy} onPress={() => void compress()} />
        {result ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, fontSize: 16 }}>{result}</Text> : null}

        <SectionTitle>{t('tools.split')}</SectionTitle>
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.splitHint')}</Text>
        <SectionTitle>{t('tools.protect')}</SectionTitle>
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('tools.protectHint')}</Text>
      </ScrollView>

      <PromptModal
        visible={naming}
        title={t('tools.mergeTitle')}
        initial={order.map((id) => docs.find((d) => d.id === id)?.title).filter(Boolean)[0] ?? ''}
        maxLength={200}
        onSubmit={(v) => void merge(v)}
        onCancel={() => setNaming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
