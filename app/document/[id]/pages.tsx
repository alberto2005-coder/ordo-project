import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { IconButton, PromptModal } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import { deletePage, getDocument, reorderPages, type DocumentRow, type PageRow } from '@/data/library';
import { splitDocument } from '@/data/pageOps';
import { dropIndex, moveItem, slideOf } from '@/data/reorder';
import { t } from '@/i18n';
import { removeFiles } from '@/services/files';
import { useTheme } from '@/theme/ThemeProvider';

/** Height of one page row plus the gap below it. Fixed, so a drag can be turned into a position. */
const ROW = 96;

function PagesBody({ id }: { id: string }) {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  // The row being dragged and how far it has moved. Other rows slide out of the way as it passes them.
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const dragTarget = drag ? dropIndex(drag.from, drag.dy, ROW, pages.length) : 0;

  const grips = useMemo(
    () => ({
      make: (index: number) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => setDrag({ from: index, dy: 0 }),
          onPanResponderMove: (_, g) => setDrag({ from: index, dy: g.dy }),
          onPanResponderRelease: (_, g) => {
            const to = dropIndex(index, g.dy, ROW, pagesRef.current.length);
            setDrag(null);
            if (to !== index) void applyOrder(moveItem(pagesRef.current, index, to));
          },
          onPanResponderTerminate: () => setDrag(null),
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const load = useCallback(async () => {
    const got = await getDocument(await getDb(), id);
    if (!got) return router.back();
    setDoc(got.doc);
    setPages(got.pages);
  }, [id, router]);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function applyOrder(next: PageRow[]) {
    setPages(next);
    try {
      await reorderPages(await getDb(), id, next.map((p) => p.id));
    } catch {
      Alert.alert(t('pages.failed'));
      await load();
    }
  }

  async function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    [next[index], next[to]] = [next[to], next[index]];
    setPages(next);
    try {
      await reorderPages(await getDb(), id, next.map((p) => p.id));
    } catch {
      Alert.alert(t('pages.failed'));
      await load();
    }
  }

  function remove(p: PageRow) {
    Alert.alert(t('pages.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pages.delete'),
        style: 'destructive',
        onPress: async () => {
          removeFiles(await deletePage(await getDb(), p.id));
          await load();
        },
      },
    ]);
  }

  async function moveSelected(where: 'start' | 'end') {
    const chosen = pages.filter((p) => picked.has(p.id));
    const rest = pages.filter((p) => !picked.has(p.id));
    const next = where === 'start' ? [...chosen, ...rest] : [...rest, ...chosen];
    setPages(next);
    try {
      await reorderPages(await getDb(), id, next.map((p) => p.id));
    } catch {
      Alert.alert(t('pages.failed'));
      await load();
    }
  }

  const toggle = (pid: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  function startSplit() {
    if (picked.size >= pages.length) return void Alert.alert(t('pages.splitNeeds'));
    setNaming(true);
  }

  async function split(name: string) {
    setNaming(false);
    try {
      const newId = await splitDocument(await getDb(), id, [...picked], name);
      setPicked(new Set());
      Alert.alert(t('pages.splitDone'));
      router.replace(`/document/${newId}`);
    } catch {
      Alert.alert(t('pages.failed'));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('pages.title') }} />
      <ScrollView scrollEnabled={!drag} contentContainerStyle={{ paddingBottom: 16 }}>
        {pages.map((item, index) => {
          const on = picked.has(item.id);
          const dragging = drag?.from === index;
          const slide = drag ? slideOf(index, drag.from, dragTarget) : 0;
          return (
            <View
              key={item.id}
              style={[
                styles.row,
                {
                  height: ROW - 8,
                  marginBottom: 8,
                  backgroundColor: on ? colors['accent-soft'] : colors.surface,
                  borderColor: on ? colors.accent : colors.border,
                  borderRadius: radius.md,
                  transform: [{ translateY: dragging ? drag!.dy : slide * ROW }],
                  zIndex: dragging ? 10 : 0,
                  elevation: dragging ? 6 : 0,
                },
              ]}
            >
              <View {...grips.make(index).panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={t('pages.drag', { n: index + 1 })} accessibilityActions={[{ name: 'increment', label: t('pages.down') }, { name: 'decrement', label: t('pages.up') }]} onAccessibilityAction={(e) => void move(index, e.nativeEvent.actionName === 'increment' ? 1 : -1)} style={styles.grip}>
                <GripVertical size={22} color={colors['text-muted']} />
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${t('pages.select')} ${index + 1}`}
                onPress={() => toggle(item.id)}
                style={styles.thumbWrap}
              >
                <Image source={{ uri: item.processed_path }} style={styles.thumb} contentFit="cover" />
                {on ? (
                  <View style={[styles.check, { backgroundColor: colors.accent }]}>
                    <Check size={16} color={colors['on-accent']} />
                  </View>
                ) : null}
              </Pressable>
              <Text style={{ color: colors.text, fontSize: 16, flex: 1 }}>{index + 1}</Text>
              <IconButton label={t('pages.up')} icon={<ArrowUp size={20} color={colors['text-muted']} />} disabled={index === 0} onPress={() => void move(index, -1)} />
              <IconButton label={t('pages.down')} icon={<ArrowDown size={20} color={colors['text-muted']} />} disabled={index === pages.length - 1} onPress={() => void move(index, 1)} />
              <IconButton label={t('pages.edit')} icon={<Pencil size={20} color={colors['text-muted']} />} onPress={() => router.push(`/page/${item.id}`)} />
              <IconButton label={t('pages.delete')} icon={<Trash2 size={20} color={colors.danger} />} disabled={pages.length <= 1} onPress={() => remove(item)} />
            </View>
          );
        })}
      </ScrollView>
      {picked.size > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors['text-muted'], textAlign: 'center' }}>{t('pages.selected', { n: picked.size })}</Text>
          <Button label={t('pages.shareSelected')} onPress={() => router.push(`/export/${id}?pages=${[...picked].join(',')}`)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label={t('pages.moveFirst')} variant="secondary" onPress={() => void moveSelected('start')} /></View>
            <View style={{ flex: 1 }}><Button label={t('pages.moveLast')} variant="secondary" onPress={() => void moveSelected('end')} /></View>
          </View>
          <Button label={t('pages.split')} variant="secondary" onPress={startSplit} />
        </View>
      ) : null}
      <PromptModal
        visible={naming}
        title={t('pages.splitTitle')}
        initial={t('pages.splitDefault', { title: doc?.title ?? '' })}
        maxLength={200}
        onSubmit={(v) => void split(v)}
        onCancel={() => setNaming(false)}
      />
    </Screen>
  );
}

export default function PagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LockGuard docId={id}>
      <PagesBody id={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderWidth: 1 },
  grip: { width: 40, height: 56, alignItems: 'center', justifyContent: 'center' },
  thumbWrap: { width: 56, height: 72, minWidth: 48 },
  thumb: { width: 56, height: 72, borderRadius: 6 },
  check: { position: 'absolute', top: 2, left: 2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
