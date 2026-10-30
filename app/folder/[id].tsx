import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, FileText, ImagePlus, Lock, MoreHorizontal } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DocGrid } from '@/components/DocGrid';
import { LockGuard } from '@/components/LockGuard';
import { EmptyState, Screen } from '@/components/Screen';
import { ActionSheet, PromptModal } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { deleteFolder, getFolder, renameFolder, setFolderLocked, type FolderSummary } from '@/data/folders';
import { listDocuments, type DocumentSummary } from '@/data/library';
import { t, useLang } from '@/i18n';
import { vault } from '@/services/auth';
import { importInto, scanInto } from '@/services/intake';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

function FolderBody({ id }: { id: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const lang = useLang();
  const settings = useApp((s) => s.settings);
  const [folder, setFolder] = useState<FolderSummary | null>(null);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [menu, setMenu] = useState(false);
  const [add, setAdd] = useState(false);
  const [rename, setRename] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    setFolder(await getFolder(db, id));
    setDocs(await listDocuments(db, { folderId: id, sort: settings?.sort_by }));
  }, [id, settings?.sort_by]);
  useFocusEffect(useCallback(() => void load(), [load]));

  const title = () => t('doc.untitled', { date: new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB') });

  async function intake(kind: 'scan' | 'import') {
    if (!settings) return;
    const target = { newIn: id, title: title() };
    const docId = kind === 'scan' ? await scanInto(target) : await importInto(target, settings.default_filter, undefined, settings.auto_crop === 1);
    if (docId) router.push(`/document/${docId}`);
  }

  async function toggleLock() {
    if (!folder) return;
    if (!folder.locked && !(await vault.hasPin())) {
      Alert.alert(t('lock.needPin'));
      return;
    }
    const db = await getDb();
    await setFolderLocked(db, id, !folder.locked);
    await load();
  }

  function confirmDelete() {
    Alert.alert(t('folder.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('folder.delete'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await deleteFolder(db, id);
          router.back();
        },
      },
    ]);
  }

  async function doRename(name: string) {
    setRename(false);
    try {
      const db = await getDb();
      await renameFolder(db, id, name);
      await load();
    } catch (e) {
      Alert.alert(e instanceof Error && /exists/.test(e.message) ? t('library.folderExists') : t('error.generic'));
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: folder?.name ?? '',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('doc.more')} onPress={() => setMenu(true)} style={styles.headerBtn}>
              <MoreHorizontal size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      {docs.length === 0 ? (
        <EmptyState icon={<FileText size={48} color={colors['text-muted']} />} text={t('folder.empty')} />
      ) : (
        <DocGrid docs={docs} view={settings?.view_mode ?? 'grid'} onOpen={(d) => router.push(`/document/${d.id}`)} />
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={t('library.add')} onPress={() => setAdd(true)} style={[styles.fab, { backgroundColor: colors.accent }]}>
        <Camera size={28} color={colors['on-accent']} />
      </Pressable>
      <ActionSheet
        visible={add}
        onClose={() => setAdd(false)}
        items={[
          { label: t('library.scan'), icon: <Camera size={22} color={colors.text} />, onPress: () => void intake('scan') },
          { label: t('library.cameraPro'), icon: <Camera size={22} color={colors.text} />, onPress: () => router.push(`/camera?mode=doc&folder=${id}`) },
          { label: t('library.import'), icon: <ImagePlus size={22} color={colors.text} />, onPress: () => void intake('import') },
        ]}
      />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: t('folder.rename'), onPress: () => setRename(true) },
          { label: folder?.locked ? t('folder.unlock') : t('folder.lock'), icon: <Lock size={22} color={colors.text} />, onPress: () => void toggleLock() },
          { label: t('folder.delete'), destructive: true, onPress: confirmDelete },
        ]}
      />
      <PromptModal visible={rename} title={t('folder.rename')} initial={folder?.name} maxLength={120} onSubmit={(v) => void doRename(v)} onCancel={() => setRename(false)} />
    </Screen>
  );
}

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LockGuard folderId={id}>
      <FolderBody id={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({
  headerBtn: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
