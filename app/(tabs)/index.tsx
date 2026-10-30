import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowDownAZ, BookOpen, Camera, Clock, FileText, FolderInput, IdCard, LayoutGrid, List, Receipt, FileUp, Share2, Trash2, X, FolderPlus, Folder as FolderIcon, ImagePlus, Lock, Plus, Search } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DocGrid } from '@/components/DocGrid';
import { EmptyState, Screen } from '@/components/Screen';
import { ActionSheet, Chip, IconButton, PromptModal } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { createFolder, listFolders, moveDocument, type FolderSummary } from '@/data/folders';
import { listDocuments, type DocumentSummary } from '@/data/library';
import { listTags, type TagSummary } from '@/data/tags';
import { t, useLang } from '@/i18n';
import { trashDocuments } from '@/data/trash';
import { canShare, exportDocumentsZip, shareFile } from '@/services/exportPdf';
import { importInto, importPdfInto, scanInto } from '@/services/intake';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Library() {
  const router = useRouter();
  const { colors, radius, layout } = useTheme();
  const lang = useLang();
  const settings = useApp((s) => s.settings);
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [tagId, setTagId] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [moveMenu, setMoveMenu] = useState(false);
  const [working, setWorking] = useState(false);
  const sort = settings?.sort_by ?? 'date';
  const view = settings?.view_mode ?? 'grid';
  const change = useApp((s) => s.change);

  const searching = query.trim().length > 0 || !!tagId;

  const refresh = useCallback(async () => {
    const db = await getDb();
    // Searching looks in every folder; browsing shows only what is not in a folder.
    setDocs(await listDocuments(db, searching ? { query, tagId, sort } : { folderId: null, sort }));
    setFolders(await listFolders(db, null));
    setTags(await listTags(db));
  }, [query, tagId, searching, sort]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const title = () => t('doc.untitled', { date: new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB') });

  async function run(kind: 'scan' | 'import' | 'id' | 'receipt' | 'book' | 'pdf') {
    if (busy || !settings) return;
    setBusy(kind);
    try {
      const date = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB');
      const id =
        kind === 'scan'
          ? await scanInto({ newIn: null, title: title() })
          : kind === 'id'
          ? await scanInto({ newIn: null, title: t('doc.untitledId', { date }) }, 'id')
          : kind === 'receipt'
          ? await scanInto({ newIn: null, title: t('doc.untitledReceipt', { date }) }, 'receipt', { filter: 'enhanced', detect: false })
          : kind === 'book'
          ? await scanInto({ newIn: null, title: t('doc.untitledBook', { date }) }, 'book', { filter: 'enhanced', detect: false })
          : kind === 'pdf'
          ? await importPdfInto({ newIn: null, title: title() })
          : await importInto({ newIn: null, title: title() }, settings.default_filter, (done, total) => setBusy(t('library.importing', { done: Math.min(done + 1, total), total })), settings.auto_crop === 1);
      if (id) router.push(`/document/${id}`);
    } finally {
      setBusy(null);
    }
  }

  async function makeFolder(name: string) {
    setNewFolder(false);
    try {
      const db = await getDb();
      await createFolder(db, name);
      await refresh();
    } catch (e) {
      Alert.alert(e instanceof Error && /exists/.test(e.message) ? t('library.folderExists') : t('error.generic'));
    }
  }

  function toggleSelect(d: DocumentSummary) {
    if (d.is_locked === 1) return void Alert.alert(t('library.lockedNoSelect'));
    setSelected((cur) => {
      const n = new Set(cur ?? []);
      if (n.has(d.id)) n.delete(d.id);
      else n.add(d.id);
      return n.size ? n : null;
    });
  }

  async function shareSelected() {
    if (!selected || !settings || working) return;
    if (!(await canShare())) return void Alert.alert(t('export.noShare'));
    setWorking(true);
    try {
      const ids = [...selected];
      const out = await exportDocumentsZip(await getDb(), ids, {
        quality: settings.export_quality,
        pageSize: settings.pdf_page_size,
        orientation: settings.pdf_orientation,
        margin: settings.pdf_margin,
        pageNumbers: settings.pdf_numbers === 1,
      });
      if (out.status !== 'ok') return void Alert.alert(t('export.failed'));
      await shareFile(out);
    } catch {
      Alert.alert(t('export.failed'));
    } finally {
      setWorking(false);
    }
  }

  async function trashSelected() {
    if (!selected) return;
    await trashDocuments(await getDb(), [...selected]);
    setSelected(null);
    await refresh();
    Alert.alert(t('library.trashDone'));
  }

  async function moveSelected(folderId: string | null) {
    if (!selected) return;
    const db = await getDb();
    for (const id of selected) await moveDocument(db, id, folderId);
    setSelected(null);
    await refresh();
  }

  const header = (
    <View style={{ gap: 12 }}>
      {tags.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
          <Chip label={t('library.allTags')} selected={!tagId} onPress={() => setTagId(undefined)} />
          {tags.map((tg) => (
            <Chip key={tg.id} label={tg.name} selected={tagId === tg.id} onPress={() => setTagId(tagId === tg.id ? undefined : tg.id)} />
          ))}
        </ScrollView>
      ) : null}
      {!searching
        ? folders.map((f) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`${f.name}, ${f.doc_count === 1 ? t('library.folderDoc') : t('library.folderDocs', { n: f.doc_count })}${f.locked ? ', ' + t('library.locked') : ''}`}
              onPress={() => router.push(`/folder/${f.id}`)}
              style={[styles.folder, { backgroundColor: colors.surface, borderRadius: radius.md, minHeight: layout['tap-target'] }]}
            >
              <FolderIcon size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{f.name}</Text>
                <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{f.doc_count === 1 ? t('library.folderDoc') : t('library.folderDocs', { n: f.doc_count })}</Text>
              </View>
              {f.locked ? <Lock size={18} color={colors['text-muted']} /> : null}
            </Pressable>
          ))
        : null}
    </View>
  );

  const nothing = docs !== null && docs.length === 0 && folders.length === 0;

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

      {selected ? (
        <View style={styles.bar}>
          <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{t('library.selected', { n: selected.size })}</Text>
          <IconButton label={t('library.shareSelected')} icon={<Share2 size={20} color={colors.accent} />} disabled={working} onPress={() => void shareSelected()} />
          <IconButton label={t('library.moveSelected')} icon={<FolderInput size={20} color={colors['text-muted']} />} onPress={() => setMoveMenu(true)} />
          <IconButton label={t('library.trashSelected')} icon={<Trash2 size={20} color={colors.danger} />} onPress={() => void trashSelected()} />
          <IconButton label={t('library.cancelSelect')} icon={<X size={20} color={colors['text-muted']} />} onPress={() => setSelected(null)} />
        </View>
      ) : (
        <View style={styles.bar}>
          <View style={{ flex: 1 }} />
          <IconButton label={t('library.sortBy')} icon={sort === 'date' ? <Clock size={20} color={colors['text-muted']} /> : <ArrowDownAZ size={20} color={colors['text-muted']} />} onPress={() => void change({ sort_by: sort === 'date' ? 'name' : 'date' })} />
          <IconButton label={t('library.viewMode')} icon={view === 'grid' ? <List size={20} color={colors['text-muted']} /> : <LayoutGrid size={20} color={colors['text-muted']} />} onPress={() => void change({ view_mode: view === 'grid' ? 'list' : 'grid' })} />
          <IconButton label={t('library.trash')} icon={<Trash2 size={20} color={colors['text-muted']} />} onPress={() => router.push('/trash')} />
        </View>
      )}

      {docs === null ? null : nothing || (searching && docs.length === 0) ? (
        <EmptyState icon={<FileText size={48} color={colors['text-muted']} />} text={searching ? t('library.noResults') : t('library.empty')} />
      ) : (
        <DocGrid docs={docs} header={header} view={view} selected={selected ?? undefined} onSelect={toggleSelect} onOpen={(d) => router.push(`/document/${d.id}`)} />
      )}

      {busy ? (
        <View style={[styles.busy, { backgroundColor: colors.text }]} accessibilityLiveRegion="polite">
          <Text style={{ color: colors.bg }}>{['scan', 'import', 'id', 'receipt', 'book', 'pdf'].includes(busy) ? t('common.loading') : busy}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('library.add')}
        accessibilityState={{ busy: !!busy }}
        onPress={() => setMenu(true)}
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.accent, opacity: pressed || busy ? 0.8 : 1 }]}
      >
        <Plus size={28} color={colors['on-accent']} />
      </Pressable>

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: t('library.scan'), icon: <Camera size={22} color={colors.text} />, onPress: () => void run('scan') },
          { label: t('library.import'), icon: <ImagePlus size={22} color={colors.text} />, onPress: () => void run('import') },
          { label: t('library.scanId'), icon: <IdCard size={22} color={colors.text} />, onPress: () => void run('id') },
          { label: t('library.scanReceipt'), icon: <Receipt size={22} color={colors.text} />, onPress: () => void run('receipt') },
          { label: t('library.scanBook'), icon: <BookOpen size={22} color={colors.text} />, onPress: () => void run('book') },
          { label: t('library.cameraPro'), icon: <Camera size={22} color={colors.text} />, onPress: () => router.push('/camera?mode=doc') },
          { label: t('library.importPdf'), icon: <FileUp size={22} color={colors.text} />, onPress: () => void run('pdf') },
          { label: t('library.newFolder'), icon: <FolderPlus size={22} color={colors.text} />, onPress: () => setNewFolder(true) },
        ]}
      />
      <ActionSheet
        visible={moveMenu}
        title={t('doc.moveToFolder')}
        onClose={() => setMoveMenu(false)}
        items={[{ label: t('doc.noFolder'), onPress: () => void moveSelected(null) }, ...folders.map((f) => ({ label: f.name, onPress: () => void moveSelected(f.id) }))]}
      />
      <PromptModal visible={newFolder} title={t('library.newFolder')} placeholder={t('library.folderName')} maxLength={120} onSubmit={(v) => void makeFolder(v)} onCancel={() => setNewFolder(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  busy: { position: 'absolute', left: 16, right: 96, bottom: 28, padding: 12, borderRadius: 12 },
});
