import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Chip } from '@/components/ui';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { getDb } from '@/data/expoDb';
import { getDocument, type DocumentRow, type PageRow } from '@/data/library';
import { savePageOcr } from '@/data/pageOps';
import { t, type StringKey } from '@/i18n';
import { canShare, exportDocumentWord, shareFile } from '@/services/exportPdf';
import { writeExport } from '@/services/files';
import { recognizeText, type OcrScript } from '@/services/ocr';
import { useTheme } from '@/theme/ThemeProvider';

function OcrBody({ id }: { id: string }) {
  const { colors, radius } = useTheme();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [script, setScript] = useState<OcrScript>('latin');

  const load = useCallback(async () => {
    const got = await getDocument(await getDb(), id);
    if (got) {
      setDoc(got.doc);
      setPages(got.pages);
    }
  }, [id]);
  useFocusEffect(useCallback(() => void load(), [load]));

  const hasText = pages.some((p) => (p.ocr_text ?? '').length > 0);
  const texts = pages.map((p) => p.ocr_text ?? '');
  const all = () => pages.map((p, i) => `${t('ocr.page', { n: i + 1 })}\n${texts[i]}`).join('\n\n');

  async function run() {
    if (progress) return;
    const db = await getDb();
    let failed = false;
    for (let i = 0; i < pages.length; i++) {
      setProgress(t('ocr.running', { done: i + 1, total: pages.length }));
      const r = await recognizeText(pages[i].processed_path, script);
      if (!r.ok) {
        failed = true;
        break;
      }
      await savePageOcr(db, pages[i].id, r.text, script);
    }
    setProgress(null);
    await load();
    if (failed) Alert.alert(t('ocr.failed'));
    else if (!(await getDocument(db, id))?.pages.some((p) => p.ocr_text)) Alert.alert(t('ocr.none'));
  }

  async function copy() {
    await Clipboard.setStringAsync(all());
    Alert.alert(t('common.copied'));
  }

  async function shareText() {
    if (!(await canShare())) return void Alert.alert(t('export.noShare'));
    try {
      const uri = await writeExport(doc?.title ?? 'text', 'txt', new TextEncoder().encode(all()));
      await shareFile({ uri, mime: 'text/plain', uti: 'public.plain-text' });
    } catch {
      Alert.alert(t('export.failed'));
    }
  }

  async function word() {
    if (!doc) return;
    if (!(await canShare())) return void Alert.alert(t('export.noShare'));
    const out = await exportDocumentWord(doc.title, texts);
    if (out.status !== 'ok') return void Alert.alert(t('export.failed'));
    await shareFile(out);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('ocr.title') }} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
        <Text style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20 }}>{t('settings.ocrNote')} {hasText ? t('ocr.editHint') : ''}</Text>
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ocr.script')}</Text>
        <View style={styles.wrap} accessibilityRole="radiogroup">
          {(['latin', 'chinese', 'japanese', 'korean', 'devanagari'] as OcrScript[]).map((sc) => (
            <Chip key={sc} label={t(`ocr.script.${sc}` as StringKey)} selected={script === sc} onPress={() => setScript(sc)} />
          ))}
        </View>
        {script !== 'latin' ? <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ocr.scriptNote')}</Text> : null}
        {!hasText ? (
          <Text style={{ color: colors['text-muted'], fontSize: 16, lineHeight: 24 }}>{t('ocr.empty')}</Text>
        ) : (
          pages.map((p, i) => (
            <View key={p.id} style={[styles.block, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ocr.page', { n: i + 1 })}</Text>
              <TextInput
                multiline
                defaultValue={p.ocr_text ?? ''}
                key={`${p.id}-${p.ocr_text ?? ''}`}
                accessibilityLabel={t('ocr.page', { n: i + 1 })}
                onEndEditing={async (e) => {
                  const next = e.nativeEvent.text;
                  if (next === (p.ocr_text ?? '')) return;
                  await savePageOcr(await getDb(), p.id, next, p.ocr_language);
                  await load();
                }}
                style={{ color: colors.text, fontSize: 16, lineHeight: 24, padding: 0, textAlignVertical: 'top' }}
              />
            </View>
          ))
        )}
      </ScrollView>
      <View style={{ gap: 8 }}>
        <Button label={progress ?? (hasText ? t('ocr.rerun') : t('ocr.run'))} loading={!!progress} onPress={() => void run()} />
        {hasText ? (
          <>
            <Button label={t('ocr.copy')} variant="secondary" onPress={() => void copy()} />
            <Button label={t('ocr.share')} variant="secondary" onPress={() => void shareText()} />
            <Button label={t('ocr.word')} variant="secondary" onPress={() => void word()} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

export default function OcrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LockGuard docId={id}>
      <OcrBody id={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({ block: { padding: 12, gap: 4 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
