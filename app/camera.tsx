import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Grid3x3, Lightbulb, X, Zap, ZapOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Chip, IconButton } from '@/components/ui';
import { t, useLang, type StringKey } from '@/i18n';
import { buildPages, type CaptureMode } from '@/services/capture';
import { removeFiles } from '@/services/files';
import { saveNewPages } from '@/services/intake';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

const MODES: CaptureMode[] = ['doc', 'receipt', 'book', 'id'];
const FLASH: FlashMode[] = ['off', 'on', 'auto'];

export default function CameraScreen() {
  const { mode: modeParam, addTo, folder } = useLocalSearchParams<{ mode?: CaptureMode; addTo?: string; folder?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const settings = useApp((s) => s.settings);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [mode, setMode] = useState<CaptureMode>(MODES.includes(modeParam as CaptureMode) ? (modeParam as CaptureMode) : 'doc');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [torch, setTorch] = useState(false);
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(0);
  const [shots, setShots] = useState<string[]>([]);
  const [taking, setTaking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Coming back from the phone's settings has to re-read the permission, otherwise
  // the screen keeps saying "no permission" after it has been granted.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission?.();
    });
    return () => sub.remove();
  }, [getPermission]);

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors['camera-bg'] }} />;
  if (!permission.granted) {
    // Once Android stops offering the dialog, asking again does nothing; only the
    // settings screen can turn the camera back on.
    const blocked = permission.canAskAgain === false;
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: colors['camera-bg'], padding: 24, gap: 16 }]}>
        <Stack.Screen options={{ title: t('camera.title') }} />
        <Text style={{ color: colors['on-camera'], fontSize: 16, lineHeight: 24, textAlign: 'center' }}>{blocked ? t('camera.blocked') : t('camera.denied')}</Text>
        <Button
          label={blocked ? t('camera.openSettings') : t('camera.allow')}
          onPress={() => {
            void (async () => {
              if (!blocked) {
                const next = await requestPermission();
                if (next.granted || next.canAskAgain) return;
              }
              await Linking.openSettings();
            })();
          }}
        />
      </View>
    );
  }

  async function shoot() {
    if (taking || saving || !camera.current) return;
    setTaking(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.95, skipProcessing: false });
      if (pic?.uri) setShots((s) => (mode === 'id' && s.length >= 2 ? s : [...s, pic.uri]));
    } catch {
      Alert.alert(t('camera.failed'));
    } finally {
      setTaking(false);
    }
  }

  async function finish() {
    if (!shots.length || !settings || saving) return;
    setSaving(true);
    try {
      const date = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB');
      const pages = await buildPages(shots, mode, { filter: settings.default_filter, detect: true }, false);
      const title =
        mode === 'id' ? t('doc.untitledId', { date }) : mode === 'receipt' ? t('doc.untitledReceipt', { date }) : mode === 'book' ? t('doc.untitledBook', { date }) : t('doc.untitled', { date });
      const id = await saveNewPages(pages, addTo ? { addTo } : { newIn: folder ?? null, title });
      removeFiles(shots);
      if (id) {
        if (addTo) router.back();
        else router.replace(`/document/${id}`);
      } else setSaving(false);
    } catch {
      Alert.alert(t('error.generic'));
      setSaving(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors['camera-bg'], paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <IconButton label={t('common.close')} icon={<X size={22} color={colors['on-camera']} />} onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <IconButton
          label={t('camera.flash', { mode: t(`camera.flash.${flash}` as StringKey) })}
          icon={flash === 'off' ? <ZapOff size={22} color={colors['on-camera']} /> : <Zap size={22} color={colors['scan-guide']} />}
          onPress={() => setFlash(FLASH[(FLASH.indexOf(flash) + 1) % FLASH.length])}
        />
        <IconButton label={t('camera.torch')} icon={<Lightbulb size={22} color={torch ? colors['scan-guide'] : colors['on-camera']} />} active={torch} onPress={() => setTorch((v) => !v)} />
        <IconButton label={t('camera.grid')} icon={<Grid3x3 size={22} color={grid ? colors['scan-guide'] : colors['on-camera']} />} active={grid} onPress={() => setGrid((v) => !v)} />
      </View>

      <View style={styles.preview}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" flash={flash} enableTorch={torch} zoom={zoom} autofocus="on" mode="picture" />
        {grid ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {[1 / 3, 2 / 3].map((p) => (
              <View key={`h${p}`} style={[styles.line, { top: `${p * 100}%`, left: 0, right: 0, height: 1, backgroundColor: colors['scan-guide'] }]} />
            ))}
            {[1 / 3, 2 / 3].map((p) => (
              <View key={`v${p}`} style={[styles.line, { left: `${p * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: colors['scan-guide'] }]} />
            ))}
          </View>
        ) : null}
        {mode === 'id' || mode === 'book' ? (
          <Text style={[styles.hint, { color: colors['on-camera'] }]}>{mode === 'id' ? t('camera.hintId') : t('camera.hintBook')}</Text>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Slider
          minimumValue={0}
          maximumValue={0.5}
          value={zoom}
          onValueChange={setZoom}
          minimumTrackTintColor={colors['scan-guide']}
          thumbTintColor={colors['scan-guide']}
          accessibilityLabel={t('camera.zoom')}
          style={{ height: 40 }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} accessibilityRole="radiogroup" style={{ flexGrow: 0 }}>
        {MODES.map((m) => (
          <Chip key={m} label={t(`camera.mode.${m}` as StringKey)} selected={mode === m} onPress={() => setMode(m)} />
        ))}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shots.length ? t('camera.undo') : t('common.close')}
          onPress={() => (shots.length ? setShots((s) => s.slice(0, -1)) : router.back())}
          style={styles.thumbWrap}
        >
          {shots.length ? <Image source={{ uri: shots[shots.length - 1] }} style={styles.thumb} contentFit="cover" /> : <X size={24} color={colors['on-camera']} />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('camera.shutter')}
          accessibilityState={{ busy: taking }}
          onPress={() => void shoot()}
          style={[styles.shutter, { borderColor: colors['on-camera'], backgroundColor: colors.accent, opacity: taking ? 0.6 : 1 }]}
        />
        <View style={{ width: 96 }}>
          {saving ? <ActivityIndicator color={colors['on-camera']} accessibilityLabel={t('camera.saving')} /> : <Button label={t('camera.done', { n: shots.length })} disabled={!shots.length} onPress={() => void finish()} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  preview: { flex: 1, overflow: 'hidden' },
  line: { position: 'absolute', opacity: 0.35 },
  hint: { position: 'absolute', bottom: 12, left: 16, right: 16, textAlign: 'center', fontSize: 14, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  thumbWrap: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  thumb: { width: 56, height: 56 },
  shutter: { width: 72, height: 72, borderRadius: 36, borderWidth: 4 },
});
