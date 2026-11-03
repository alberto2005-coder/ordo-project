import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { Chip, SectionTitle } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { getDocument } from '@/data/library';
import { t, useLang, type StringKey } from '@/i18n';
import {
  canShare,
  exportDocumentExcel,
  exportDocumentImages,
  exportDocumentPdf,
  exportDocumentPowerpoint,
  exportDocumentWord,
  exportImageFiles,
  formatSize,
  printPdf,
  shareFile,
  type ExportOutcome,
} from '@/services/exportPdf';
import { saveToFolder, saveToGallery, type SaveResult } from '@/services/save';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

type Format = 'pdf' | 'jpg' | 'png' | 'word' | 'excel' | 'pptx';
const FORMATS: Format[] = ['pdf', 'jpg', 'png', 'word', 'excel', 'pptx'];
type Orientation = 'auto' | 'portrait' | 'landscape';
type Margin = 'none' | 'small' | 'normal';

function ExportBody({ id, pageIds }: { id: string; pageIds?: string[] }) {
  const { colors, radius, layout } = useTheme();
  useLang();
  const settings = useApp((s) => s.settings)!;
  const [format, setFormat] = useState<Format>('pdf');
  const [password, setPassword] = useState('');
  const [watermark, setWatermark] = useState('');
  const [orientation, setOrientation] = useState<Orientation>(settings.pdf_orientation);
  const [margin, setMargin] = useState<Margin>(settings.pdf_margin);
  const [numbers, setNumbers] = useState(settings.pdf_numbers === 1);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    void (async () => setTitle((await getDocument(await getDb(), id))?.doc.title ?? ''))();
  }, [id]);
  useEffect(() => setInfo(null), [format]);

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors['border-input'],
    borderRadius: radius.md,
    minHeight: layout['tap-target'],
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 16,
  } as const;

  async function texts(): Promise<string[] | null> {
    const got = await getDocument(await getDb(), id);
    const set = pageIds?.length ? new Set(pageIds) : null;
    const list = (got?.pages ?? []).filter((p) => !set || set.has(p.id)).map((p) => p.ocr_text ?? '');
    if (!list.some((x) => x.trim())) {
      Alert.alert(t('export.needText'));
      return null;
    }
    return list;
  }

  /** Builds the file for the chosen format. Returns null (after telling the person) if it can't. */
  async function make(forPrint = false): Promise<(ExportOutcome & { status: 'ok' }) | null> {
    const db = await getDb();
    let out: ExportOutcome & { skippedText?: number };
    if (format === 'pdf' || forPrint) {
      if (!forPrint && password && password.length < 8) {
        Alert.alert(t('export.passwordShort'));
        return null;
      }
      out = await exportDocumentPdf(db, id, {
        quality: settings.export_quality,
        pageSize: settings.pdf_page_size,
        password: forPrint ? undefined : password || undefined,
        watermark: watermark.trim() || undefined,
        orientation,
        margin,
        pageNumbers: numbers,
        pageIds,
      });
    } else if (format === 'jpg' || format === 'png') {
      out = await exportDocumentImages(db, id, settings.export_quality, { format, pageIds });
    } else if (format === 'pptx') {
      out = await exportDocumentPowerpoint(db, id, settings.export_quality, pageIds);
    } else {
      const list = await texts();
      if (!list) return null;
      out = format === 'word' ? await exportDocumentWord(title || 'Ordo', list) : await exportDocumentExcel(title || 'Ordo', list);
    }
    if (out.status !== 'ok') {
      Alert.alert(t('export.failed'));
      return null;
    }
    if (out.skippedText) Alert.alert(t('doc.skippedText'));
    setInfo(t('export.size', { size: formatSize(out.size) }));
    return out;
  }

  async function guard(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      Alert.alert(t('export.failed'));
    } finally {
      setBusy(false);
    }
  }

  const share = () =>
    guard(async () => {
      if (!(await canShare())) return void Alert.alert(t('export.noShare'));
      const out = await make();
      if (out) await shareFile(out);
    });

  const report = (r: SaveResult) => {
    if (r.status === 'ok') Alert.alert(t('export.saved'));
    else if (r.status === 'denied') Alert.alert(t('export.denied'));
    else if (r.status === 'error') Alert.alert(t('export.saveFailed'));
  };

  const saveFolder = () =>
    guard(async () => {
      const out = await make();
      if (!out) return;
      report(await saveToFolder(out.uri, decodeURIComponent(out.uri.split('/').pop() ?? 'Ordo')));
    });

  const saveGallery = () =>
    guard(async () => {
      const r = await exportImageFiles(await getDb(), id, settings.export_quality, { format: format === 'png' ? 'png' : 'jpg', pageIds });
      if (r.status !== 'ok') return void Alert.alert(t('export.failed'));
      if (r.skippedText) Alert.alert(t('doc.skippedText'));
      const s = await saveToGallery(r.uris);
      if (s.status === 'ok') Alert.alert(t('export.savedGallery', { n: s.count }));
      else report(s);
    });

  const print = () =>
    guard(async () => {
      const out = await make(true);
      if (out) await printPdf(out.uri);
    });

  const isImages = format === 'jpg' || format === 'png';
  const row = <T extends string>(label: string, value: T, options: T[], key: (v: T) => StringKey, set: (v: T) => void) => (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
        {options.map((o) => (
          <Chip key={o} label={t(key(o))} selected={value === o} onPress={() => set(o)} />
        ))}
      </View>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('export.title') }} />
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors['text-muted'], fontSize: 14 }}>
          {title ? `${title} · ` : ''}
          {pageIds?.length ? t('export.scopeSome', { n: pageIds.length }) : t('export.scopeAll')}
        </Text>
        {row(t('export.format'), format, FORMATS, (f) => `export.format.${f}` as StringKey, setFormat)}

        {format === 'pdf' ? (
          <>
            <SectionTitle>{t('export.options')}</SectionTitle>
            <TextInput value={password} onChangeText={setPassword} placeholder={t('export.password')} placeholderTextColor={colors['text-muted']} accessibilityLabel={t('export.password')} secureTextEntry autoCapitalize="none" autoCorrect={false} style={inputStyle} />
            {password ? <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('doc.password.msg')}</Text> : null}
            <TextInput value={watermark} onChangeText={setWatermark} placeholder={t('export.watermark')} placeholderTextColor={colors['text-muted']} accessibilityLabel={t('export.watermark')} maxLength={60} style={inputStyle} />
            {row<Orientation>(t('export.orientation'), orientation, ['auto', 'portrait', 'landscape'], (o) => `export.orientation.${o}` as StringKey, setOrientation)}
            {row<Margin>(t('export.margin'), margin, ['none', 'small', 'normal'], (m) => `export.margin.${m}` as StringKey, setMargin)}
            <Chip radio={false} label={t('export.numbers')} selected={numbers} onPress={() => setNumbers((v) => !v)} />
          </>
        ) : null}
        {info ? <Text accessibilityLiveRegion="polite" style={{ color: colors.success, fontSize: 14 }}>{info}</Text> : null}
      </ScrollView>
      <View style={{ gap: 8 }}>
        <Button label={busy ? t('export.working') : t('export.share')} loading={busy} onPress={() => void share()} />
        <Button label={t('export.saveFolder')} variant="secondary" disabled={busy} onPress={() => void saveFolder()} />
        {isImages ? <Button label={t('export.saveGallery')} variant="secondary" disabled={busy} onPress={() => void saveGallery()} /> : null}
        {format === 'pdf' ? <Button label={t('export.print')} variant="ghost" disabled={busy} onPress={() => void print()} /> : null}
      </View>
    </Screen>
  );
}

export default function ExportScreen() {
  const { id, pages } = useLocalSearchParams<{ id: string; pages?: string }>();
  return (
    <LockGuard docId={id}>
      <ExportBody id={id} pageIds={pages ? pages.split(',').filter(Boolean) : undefined} />
    </LockGuard>
  );
}
