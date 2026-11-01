import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Crop, RotateCcw, RotateCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { CropEditor } from '@/components/CropEditor';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { Chip, IconButton } from '@/components/ui';
import { getDb } from '@/data/expoDb';
import type { Filter, PageRow } from '@/data/library';
import { updatePageEdit } from '@/data/pageOps';
import { FULL_PAGE, isFullPage, parseCorners, type Corners } from '@/image/warp';
import { t, type StringKey } from '@/i18n';
import { detectPageIn } from '@/services/detect';
import { removeFiles } from '@/services/files';
import { PAGE_MAX_SIDE, PREVIEW_MAX_SIDE, renderPage } from '@/services/render';
import { useTheme } from '@/theme/ThemeProvider';

type Rot = 0 | 90 | 180 | 270;
const FILTERS: Filter[] = ['original', 'enhanced', 'bw', 'gray'];

function EditBody({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const [page, setPage] = useState<PageRow | null>(null);
  const [filter, setFilter] = useState<Filter>('original');
  const [rotation, setRotation] = useState<Rot>(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [crop, setCrop] = useState<Corners>(FULL_PAGE);
  const [cropping, setCropping] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const run = useRef(0);
  /** The last preview file, removed when a new one replaces it so the cache does not pile up. */
  const lastPreview = useRef<string | null>(null);

  // Nothing to clean up if the screen is left while a preview is showing.
  useEffect(
    () => () => {
      if (lastPreview.current) removeFiles([lastPreview.current]);
      lastPreview.current = null;
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const row = await db.first<PageRow>('select * from pages where id = ?', [pageId]);
      if (!row) return router.back();
      setPage(row);
      setFilter(row.filter);
      setRotation(row.rotation as Rot);
      setBrightness(row.brightness);
      setContrast(row.contrast);
      setCrop(parseCorners(row.crop_corners) ?? FULL_PAGE);
    })();
  }, [pageId, router]);

  // Redraw the preview shortly after the last change. Older runs that finish late are ignored.
  useEffect(() => {
    if (!page) return;
    const mine = ++run.current;
    const timer = setTimeout(async () => {
      setWorking(true);
      try {
        const uri = await renderPage(page.original_path, { filter, rotation, brightness, contrast, crop }, { maxSide: PREVIEW_MAX_SIDE, persist: false });
        if (mine === run.current) {
          const old = lastPreview.current;
          lastPreview.current = uri;
          setPreview(uri);
          if (old && old !== uri) removeFiles([old]);
        }
      } catch {
        if (mine === run.current) Alert.alert(t('edit.failed'));
      } finally {
        if (mine === run.current) setWorking(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [page, filter, rotation, brightness, contrast, crop]);

  const turn = useCallback((d: 90 | -90) => setRotation((r) => ((r + d + 360) % 360) as Rot), []);
  const reset = () => {
    setFilter('original');
    setRotation(0);
    setBrightness(0);
    setContrast(0);
    setCrop(FULL_PAGE);
  };

  async function save() {
    if (!page || saving) return;
    setSaving(true);
    try {
      const edit = { filter, rotation, brightness, contrast, crop: isFullPage(crop) ? null : crop };
      const uri = await renderPage(page.original_path, edit, { maxSide: PAGE_MAX_SIDE, persist: true });
      const old = await updatePageEdit(await getDb(), page.id, edit, uri);
      removeFiles(old);
      router.back();
    } catch {
      Alert.alert(t('edit.failed'));
      setSaving(false);
    }
  }

  const sliderRow = (label: string, value: number, set: (n: number) => void) => (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{label}: {Math.round(value * 100)}</Text>
      <Slider
        minimumValue={-1}
        maximumValue={1}
        step={0.05}
        value={value}
        onSlidingComplete={set}
        minimumTrackTintColor={colors.accent}
        thumbTintColor={colors.accent}
        accessibilityLabel={label}
        style={{ height: 48 }}
      />
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('edit.title') }} />
      <View style={[styles.preview, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
        {cropping && page ? <CropEditor uri={page.original_path} corners={crop} onChange={setCrop} /> : null}
        {!cropping && preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
        {working && !cropping ? <ActivityIndicator style={styles.spin} color={colors.accent} accessibilityLabel={t('edit.processing')} /> : null}
      </View>
      {cropping ? (
        <View style={{ gap: 8, paddingVertical: 12 }}>
          <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('crop.hint')}</Text>
          <Button
            label={t('crop.detect')}
            variant="secondary"
            onPress={async () => {
              const found = page ? await detectPageIn(page.original_path) : null;
              if (found) setCrop(found);
              Alert.alert(found ? t('crop.found') : t('crop.notFound'));
            }}
          />
          <Button label={t('crop.fullPage')} variant="ghost" onPress={() => setCrop(FULL_PAGE)} />
          <Button label={t('crop.done')} onPress={() => setCropping(false)} />
        </View>
      ) : (
      <ScrollView style={{ flexGrow: 0, maxHeight: 340 }} contentContainerStyle={{ gap: 12, paddingVertical: 12 }}>
        <View accessibilityRole="radiogroup" style={styles.row}>
          {FILTERS.map((f) => (
            <Chip key={f} label={t(`edit.filter.${f}` as StringKey)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </View>
        {sliderRow(t('edit.brightness'), brightness, setBrightness)}
        {sliderRow(t('edit.contrast'), contrast, setContrast)}
        <View style={styles.row}>
          <IconButton label={t('edit.rotateLeft')} icon={<RotateCcw size={22} color={colors['text-muted']} />} onPress={() => turn(-90)} />
          <IconButton label={t('edit.rotateRight')} icon={<RotateCw size={22} color={colors['text-muted']} />} onPress={() => turn(90)} />
          <IconButton label={t('crop.title')} icon={<Crop size={22} color={colors['text-muted']} />} active={!isFullPage(crop)} onPress={() => setCropping(true)} />
          <Button label={t('edit.reset')} variant="ghost" onPress={reset} />
        </View>
      </ScrollView>
      )}
      {cropping ? null : <Button label={saving ? t('edit.processing') : t('common.save')} loading={saving} onPress={() => void save()} />}
    </Screen>
  );
}

export default function PageEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [docId, setDocId] = useState<string | undefined>();
  useEffect(() => {
    void (async () => {
      const r = await (await getDb()).first<{ document_id: string }>('select document_id from pages where id = ?', [id]);
      setDocId(r?.document_id);
    })();
  }, [id]);
  if (!docId) return null;
  return (
    <LockGuard docId={docId}>
      <EditBody pageId={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({
  preview: { flex: 1, overflow: 'hidden', minHeight: 200 },
  spin: { position: 'absolute', top: 12, right: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
