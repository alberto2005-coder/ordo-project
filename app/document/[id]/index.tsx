import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, FileText, Files, FolderInput, ImagePlus, Lock, MoreHorizontal, PenLine, Share2, Tag, Trash2, Type } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LockGuard } from '@/components/LockGuard';
import { EmptyState, Screen } from '@/components/Screen';
import { ActionSheet, IconButton, PromptModal, type SheetItem } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { listFolders, moveDocument, setDocumentLocked, type FolderSummary } from '@/data/folders';
import { getDocument, renameDocument, type DocumentRow, type PageRow } from '@/data/library';
import { getDocumentTags, setDocumentTags } from '@/data/tags';
import { t } from '@/i18n';
import { vault } from '@/services/auth';
import { canShare, exportDocumentPdf, formatSize, shareFile, type ExportOutcome } from '@/services/exportPdf';
import { trashDocuments } from '@/data/trash';
import { importInto, importPdfInto, scanInto } from '@/services/intake';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

type Ask = null | 'tags';

function DocumentBody({ id }: { id: string }) {
  const router = useRouter();
  const { colors, radius, layout } = useTheme();
  const settings = useApp((s) => s.settings);
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [ask, setAsk] = useState<Ask>(null);
  const [tags, setTags] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    const got = await getDocument(db, id);
    if (!got) return setMissing(true);
    setDoc(got.doc);
    setPages(got.pages);
    setTitle(got.doc.title);
  }, [id]);
  useFocusEffect(useCallback(() => void load(), [load]));

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

  /** Runs an export, then hands the file to the share sheet. */
  async function exportAndShare(make: () => Promise<ExportOutcome & { skippedText?: number }>, after?: (o: ExportOutcome) => void) {
    if (busy) return;
    if (!(await canShare())) return void Alert.alert(t('export.noShare'));
    setBusy(true);
    try {
      const out = await make();
      if (out.status !== 'ok') return void Alert.alert(t('export.failed'));
      if (out.skippedText) Alert.alert(t('doc.skippedText'));
      after?.(out);
      await shareFile(out);
    } catch {
      Alert.alert(t('export.failed'));
    } finally {
      setBusy(false);
    }
  }

  const pdfOpts = (extra: { password?: string; watermark?: string } = {}) => ({
    quality: settings!.export_quality,
    pageSize: settings!.pdf_page_size,
    orientation: settings!.pdf_orientation,
    margin: settings!.pdf_margin,
    pageNumbers: settings!.pdf_numbers === 1,
    ...extra,
  });

  const sharePdf = (extra?: { password?: string; watermark?: string }) =>
    exportAndShare(async () => exportDocumentPdf(await getDb(), id, pdfOpts(extra)), (o) => o.status === 'ok' && Alert.alert(t('doc.pdfSize', { size: formatSize(o.size) })));

  async function addPages(kind: 'scan' | 'import' | 'pdf') {
    if (!settings) return;
    if (kind === 'pdf') {
      if (await importPdfInto({ addTo: id })) await load();
      return;
    }
    const r = kind === 'scan' ? await scanInto({ addTo: id }) : await importInto({ addTo: id }, settings.default_filter, undefined, settings.auto_crop === 1);
    if (r) await load();
  }

  async function openMove() {
    setFolders(await listFolders(await getDb(), null));
    setFolderMenu(true);
  }

  async function move(folderId: string | null) {
    try {
      await moveDocument(await getDb(), id, folderId);
      await load();
    } catch {
      Alert.alert(t('doc.moveFailed'));
    }
  }

  async function openTags() {
    setTags((await getDocumentTags(await getDb(), id)).join(', '));
    setAsk('tags');
  }

  async function toggleLock() {
    if (!doc) return;
    if (!doc.locked && !(await vault.hasPin())) return void Alert.alert(t('lock.needPin'));
    await setDocumentLocked(await getDb(), id, !doc.locked);
    await load();
  }

  function confirmDelete() {
    Alert.alert(t('doc.trashConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('doc.trash'),
        style: 'destructive',
        onPress: async () => {
          await trashDocuments(await getDb(), [id]);
          router.back();
        },
      },
    ]);
  }

  async function submit(value: string) {
    const kind = ask;
    setAsk(null);
    const v = value.trim();
    if (kind === 'tags') {
      await setDocumentTags(await getDb(), id, v.split(',').map((x) => x.trim()).filter(Boolean));
    }
  }

  if (missing) {
    return (
      <Screen>
        <EmptyState icon={<FileText size={48} color={colors['text-muted']} />} text={t('error.generic')} />
      </Screen>
    );
  }

  const none = pages.length === 0;
  const ic = (C: typeof Share2) => <C size={22} color={colors['text-muted']} />;
  const sheet: SheetItem[] = [
    { label: t('doc.addScan'), icon: ic(Camera), onPress: () => void addPages('scan') },
    { label: t('library.cameraPro'), icon: ic(Camera), onPress: () => router.push(`/camera?mode=doc&addTo=${id}`) },
    { label: t('doc.addPhotos'), icon: ic(ImagePlus), onPress: () => void addPages('import') },
    { label: t('library.importPdf'), icon: ic(FileText), onPress: () => void addPages('pdf') },
    { label: t('doc.export'), icon: ic(Share2), onPress: () => router.push(`/export/${id}`) },
    { label: t('doc.moveToFolder'), icon: ic(FolderInput), onPress: () => void openMove() },
    { label: t('doc.tags'), icon: ic(Tag), onPress: () => void openTags() },
    { label: doc?.locked ? t('doc.unlock') : t('doc.lock'), icon: ic(Lock), onPress: () => void toggleLock() },
    { label: t('doc.trash'), icon: <Trash2 size={22} color={colors.danger} />, destructive: true, onPress: confirmDelete },
  ];

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
      {none ? (
        <EmptyState icon={<FileText size={48} color={colors['text-muted']} />} text={t('doc.noPages')} />
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('ann.page', { n: index + 1, total: pages.length })}`}
              onPress={() => router.push(`/view/${id}?index=${index}`)}
              style={[styles.page, { backgroundColor: colors.surface, borderRadius: radius.md }]}
            >
              <Image source={{ uri: item.processed_path }} style={styles.image} contentFit="contain" />
              <Text style={[styles.pageNo, { color: colors['text-muted'] }]}>{index + 1} / {pages.length}</Text>
            </Pressable>
          )}
        />
      )}
      <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors['surface-raised'] }]}>
        <IconButton label={busy ? t('doc.exporting') : t('doc.share')} icon={<Share2 size={22} color={colors.accent} />} disabled={none || busy} onPress={() => void sharePdf()} />
        <IconButton label={t('doc.text')} icon={<Type size={22} color={colors['text-muted']} />} disabled={none} onPress={() => router.push(`/ocr/${id}`)} />
        <IconButton label={t('doc.annotate')} icon={<PenLine size={22} color={colors['text-muted']} />} disabled={none} onPress={() => router.push(`/annotate/${id}`)} />
        <IconButton label={t('doc.pagesEdit')} icon={<Files size={22} color={colors['text-muted']} />} disabled={none} onPress={() => router.push(`/document/${id}/pages`)} />
        <IconButton label={t('doc.more')} icon={<MoreHorizontal size={22} color={colors['text-muted']} />} onPress={() => setMenu(true)} />
      </View>

      <ActionSheet visible={menu} items={sheet} onClose={() => setMenu(false)} />
      <ActionSheet
        visible={folderMenu}
        title={t('doc.moveToFolder')}
        onClose={() => setFolderMenu(false)}
        items={[{ label: t('doc.noFolder'), onPress: () => void move(null) }, ...folders.map((f) => ({ label: f.name, onPress: () => void move(f.id) }))]}
      />
      <PromptModal
        visible={ask !== null}
        title={t('doc.tags.title')}
        message={t('doc.tags.msg')}
        initial={tags}
        maxLength={200}
        submitLabel={t('common.save')}
        onSubmit={(v) => void submit(v)}
        onCancel={() => setAsk(null)}
      />
    </Screen>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LockGuard docId={id}>
      <DocumentBody id={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, lineHeight: 28, fontWeight: '600', borderWidth: 1, paddingHorizontal: 12 },
  page: { padding: 8, alignItems: 'center' },
  image: { width: '100%', aspectRatio: 0.72 },
  pageNo: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingTop: 4, marginHorizontal: -16 },
});
