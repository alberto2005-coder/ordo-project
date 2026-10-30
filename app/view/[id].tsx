import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Crop, PenLine } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Image as RNImage, Text, View } from 'react-native';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { IconButton } from '@/components/ui';
import { ZoomView } from '@/components/ZoomView';
import { listAnnotations, type Annotation } from '@/data/annotations';
import { getDb } from '@/data/expoDb';
import { getDocument, type PageRow } from '@/data/library';
import { t } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

function ViewBody({ id, start }: { id: string; start: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [index, setIndex] = useState(start);
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [aspect, setAspect] = useState(0.72);

  const load = useCallback(async () => {
    const got = await getDocument(await getDb(), id);
    setPages(got?.pages ?? []);
  }, [id]);
  useFocusEffect(useCallback(() => void load(), [load]));

  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const pageId = page?.id;
  const uri = page?.processed_path;
  useFocusEffect(
    useCallback(() => {
      if (!pageId || !uri) return;
      RNImage.getSize(uri, (w, h) => setAspect(w / h), () => {});
      void (async () => setNotes(await listAnnotations(await getDb(), pageId)))();
    }, [pageId, uri]),
  );

  if (!page) return <Screen><View /></Screen>;
  return (
    <Screen>
      <Stack.Screen options={{ title: t('ann.page', { n: index + 1, total: pages.length }) }} />
      <ZoomView key={page.id + page.processed_path} uri={page.processed_path} aspect={aspect} annotations={notes} />
      <Text style={{ color: colors['text-muted'], fontSize: 14, textAlign: 'center' }}>{t('view.hint')}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <IconButton label={t('ann.prev')} icon={<ChevronLeft size={22} color={colors['text-muted']} />} disabled={index === 0} onPress={() => setIndex(index - 1)} />
        <IconButton label={t('edit.title')} icon={<Crop size={22} color={colors['text-muted']} />} onPress={() => router.push(`/page/${page.id}`)} />
        <IconButton label={t('doc.annotate')} icon={<PenLine size={22} color={colors['text-muted']} />} onPress={() => router.push(`/annotate/${id}`)} />
        <IconButton label={t('ann.next')} icon={<ChevronRight size={22} color={colors['text-muted']} />} disabled={index >= pages.length - 1} onPress={() => setIndex(index + 1)} />
      </View>
    </Screen>
  );
}

export default function ViewScreen() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  return (
    <LockGuard docId={id}>
      <ViewBody id={id} start={Number(index) || 0} />
    </LockGuard>
  );
}
