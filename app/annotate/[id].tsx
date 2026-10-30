import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Eraser, Highlighter, PenLine, Redo2, Signature, Trash2, Type, Undo2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image as RNImage, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { AnnotationLayer } from '@/components/AnnotationLayer';
import { Button } from '@/components/Button';
import { LockGuard } from '@/components/LockGuard';
import { Screen } from '@/components/Screen';
import { TouchCanvas } from '@/components/TouchCanvas';
import { Chip, IconButton, PromptModal } from '@/components/ui';
import { addAnnotation, deleteSignature, listAnnotations, listSignatures, removeAnnotation, saveSignature, type Annotation, type AnnotationData, type Point } from '@/data/annotations';
import { getDb } from '@/data/expoDb';
import { hitAnnotation } from '@/data/hitTest';
import { getDocument, type PageRow } from '@/data/library';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

type Tool = 'pen' | 'highlight' | 'text' | 'sign' | 'erase';
const COLORS = { black: '#000000', blue: '#1d4ed8', red: '#dc2626', green: '#15803d', yellow: '#facc15' } as const;
type ColorName = keyof typeof COLORS;
const SIZES = { s: 0.004, m: 0.008, l: 0.016 } as const;
type SizeName = keyof typeof SIZES;
const TEXT_SIZE = { s: 0.025, m: 0.04, l: 0.06 } as const;
const SIGN_W = 0.3;
const PAD_ASPECT = 0.4; // signature pad height / width

type Sig = { id: string; strokes: Point[][] };

function SigPreview({ strokes, color, w = 96 }: { strokes: Point[][]; color: string; w?: number }) {
  const h = w * PAD_ASPECT;
  return (
    <Svg width={w} height={h}>
      {strokes.map((s, i) => (
        <Polyline key={i} points={s.map(([x, y]) => `${x * w},${y * h}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

function SignaturePad({ visible, onSave, onClose }: { visible: boolean; onSave: (s: Point[][]) => void; onClose: () => void }) {
  const { colors, radius } = useTheme();
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const W = 300;
  useEffect(() => {
    if (visible) setStrokes([]);
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.center}>
        <View style={[styles.dialog, { backgroundColor: colors['surface-raised'], borderRadius: radius.lg }]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{t('ann.signNew')}</Text>
          <View style={{ borderWidth: 1, borderColor: colors['border-input'], borderRadius: radius.md, backgroundColor: '#ffffff', overflow: 'hidden', alignSelf: 'center' }}>
            <TouchCanvas width={W} height={W * PAD_ASPECT} mode="stroke" liveColor="#000000" liveWidth={2} label={t('ann.signDraw')} onStroke={(p) => setStrokes((s) => (s.length < 50 ? [...s, p] : s))}>
              <SigPreview strokes={strokes} color="#000000" w={W} />
            </TouchCanvas>
          </View>
          <Text style={{ color: colors['text-muted'], textAlign: 'center' }}>{t('ann.signDraw')}</Text>
          <Button label={t('ann.signSave')} disabled={!strokes.length} onPress={() => onSave(strokes)} />
          <Button label={t('ann.signClear')} variant="secondary" disabled={!strokes.length} onPress={() => setStrokes([])} />
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function AnnotateBody({ id }: { id: string }) {
  const { colors, radius } = useTheme();
  const [pages, setPages] = useState<PageRow[]>([]);
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<Annotation[]>([]);
  const [aspect, setAspect] = useState(0.72);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<ColorName>('blue');
  const [size, setSize] = useState<SizeName>('m');
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [sigId, setSigId] = useState<string | null>(null);
  const [pad, setPad] = useState(false);
  const [textAt, setTextAt] = useState<Point | null>(null);
  // Things taken away by undo or the eraser, newest last, so Redo can put them back. Cleared when the page changes.
  const [redoStack, setRedoStack] = useState<AnnotationData[]>([]);

  const page = pages[index];

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const got = await getDocument(db, id);
      if (got) setPages(got.pages);
      setSigs(await listSignatures(db));
    })();
  }, [id]);

  const reload = useCallback(async () => {
    if (page) setItems(await listAnnotations(await getDb(), page.id));
  }, [page]);

  useEffect(() => setRedoStack([]), [index]);

  useEffect(() => {
    if (!page) return;
    void reload();
    RNImage.getSize(page.processed_path, (w, h) => setAspect(w / h), () => {});
  }, [page, reload]);

  // The page picture is as large as fits the free space while keeping its shape.
  const boxW = Math.max(0, Math.min(area.w, area.h * aspect));
  const boxH = aspect ? boxW / aspect : 0;

  async function add(data: Parameters<typeof addAnnotation>[2]) {
    if (!page) return;
    try {
      await addAnnotation(await getDb(), page.id, data);
      setRedoStack([]);
      await reload();
    } catch {
      Alert.alert(t('ann.failed'));
    }
  }

  const stroke = (points: Point[]) => {
    const hl = tool === 'highlight';
    void add({ kind: hl ? 'highlight' : 'draw', color: COLORS[hl ? 'yellow' : color], width: SIZES[size] * (hl ? 4 : 1), points });
  };

  const tap = (p: Point) => {
    if (tool === 'erase') {
      const hit = hitAnnotation(items, p, boxW, boxH);
      const found = items.find((a) => a.id === hit);
      if (found) void remove(found);
      return;
    }
    if (tool === 'text') return setTextAt(p);
    if (tool === 'sign') {
      const sig = sigs.find((s) => s.id === sigId);
      if (!sig) return void Alert.alert(t('ann.signPick'));
      const w = SIGN_W;
      const hFrac = (w * PAD_ASPECT * boxW) / boxH;
      void add({ kind: 'signature', x: Math.min(Math.max(p[0] - w / 2, 0), 1 - w), y: Math.min(Math.max(p[1] - hFrac / 2, 0), 1 - hFrac), w, aspect: PAD_ASPECT, color: '#000000', strokes: sig.strokes });
    }
  };

  async function remove(a: Annotation) {
    await removeAnnotation(await getDb(), a.id);
    setRedoStack((r) => [...r, a.data]);
    await reload();
  }

  async function undo() {
    const last = items[items.length - 1];
    if (last) await remove(last);
  }

  async function redo() {
    const data = redoStack[redoStack.length - 1];
    if (!data || !page) return;
    setRedoStack((r) => r.slice(0, -1));
    try {
      await addAnnotation(await getDb(), page.id, data);
      await reload();
    } catch {
      Alert.alert(t('ann.failed'));
    }
  }

  async function newSignature(strokes: Point[][]) {
    setPad(false);
    try {
      const db = await getDb();
      const sid = await saveSignature(db, strokes);
      setSigs(await listSignatures(db));
      setSigId(sid);
    } catch {
      Alert.alert(t('ann.failed'));
    }
  }

  async function removeSig(sid: string) {
    await deleteSignature(await getDb(), sid);
    setSigs(await listSignatures(await getDb()));
    if (sigId === sid) setSigId(null);
  }

  const drawing = tool === 'pen' || tool === 'highlight';
  const liveColor = COLORS[tool === 'highlight' ? 'yellow' : color];
  const liveWidth = SIZES[size] * (tool === 'highlight' ? 4 : 1) * boxW;
  const ic = (C: typeof PenLine, on: boolean) => <C size={22} color={on ? colors.accent : colors['text-muted']} />;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('ann.title') }} />
      <View style={styles.nav}>
        <IconButton label={t('ann.prev')} icon={<ChevronLeft size={22} color={colors['text-muted']} />} disabled={index === 0} onPress={() => setIndex(index - 1)} />
        <Text style={{ color: colors.text, fontSize: 16 }}>{t('ann.page', { n: index + 1, total: pages.length })}</Text>
        <IconButton label={t('ann.next')} icon={<ChevronRight size={22} color={colors['text-muted']} />} disabled={index >= pages.length - 1} onPress={() => setIndex(index + 1)} />
      </View>

      <View style={[styles.stage, { backgroundColor: colors.surface, borderRadius: radius.md }]} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {page && boxW > 0 ? (
          <TouchCanvas
            width={boxW}
            height={boxH}
            mode={drawing ? 'stroke' : 'tap'}
            liveColor={liveColor}
            liveWidth={liveWidth}
            liveOpacity={tool === 'highlight' ? 0.35 : 1}
            onStroke={stroke}
            onTap={tap}
            label={t('ann.title')}
          >
            <Image source={{ uri: page.processed_path }} style={{ width: boxW, height: boxH }} contentFit="fill" />
            <AnnotationLayer items={items} width={boxW} height={boxH} />
          </TouchCanvas>
        ) : null}
      </View>

      <View style={{ gap: 8, paddingTop: 8 }}>
        <View style={styles.tools}>
          <IconButton label={t('ann.pen')} icon={ic(PenLine, tool === 'pen')} active={tool === 'pen'} onPress={() => setTool('pen')} />
          <IconButton label={t('ann.highlight')} icon={ic(Highlighter, tool === 'highlight')} active={tool === 'highlight'} onPress={() => setTool('highlight')} />
          <IconButton label={t('ann.text')} icon={ic(Type, tool === 'text')} active={tool === 'text'} onPress={() => setTool('text')} />
          <IconButton label={t('ann.sign')} icon={ic(Signature, tool === 'sign')} active={tool === 'sign'} onPress={() => setTool('sign')} />
          <IconButton label={t('ann.erase')} icon={ic(Eraser, tool === 'erase')} active={tool === 'erase'} onPress={() => setTool('erase')} />
          <IconButton label={t('ann.undo')} icon={<Undo2 size={22} color={colors['text-muted']} />} disabled={!items.length} onPress={() => void undo()} />
          <IconButton label={t('ann.redo')} icon={<Redo2 size={22} color={colors['text-muted']} />} disabled={!redoStack.length} onPress={() => void redo()} />
        </View>

        {tool === 'erase' ? (
          <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ann.eraseHint')}</Text>
        ) : tool === 'sign' ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ann.signPick')}</Text>
            <ScrollView horizontal contentContainerStyle={{ gap: 8, alignItems: 'center' }} showsHorizontalScrollIndicator={false}>
              {sigs.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sigId === s.id }}
                    accessibilityLabel={t('ann.sign')}
                    onPress={() => setSigId(s.id)}
                    style={{ padding: 4, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 2, borderColor: sigId === s.id ? colors.accent : colors.border }}
                  >
                    <SigPreview strokes={s.strokes} color="#000000" />
                  </Pressable>
                  <IconButton label={t('ann.signDelete')} icon={<Trash2 size={18} color={colors.danger} />} onPress={() => void removeSig(s.id)} />
                </View>
              ))}
              <Button label={t('ann.signNew')} variant="secondary" onPress={() => setPad(true)} />
            </ScrollView>
          </View>
        ) : (
          <>
            {tool !== 'highlight' ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="radiogroup">
                {(Object.keys(COLORS) as ColorName[]).map((c) => (
                  <Chip key={c} label={t(`ann.color.${c}` as StringKey)} selected={color === c} onPress={() => setColor(c)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
              {(Object.keys(SIZES) as SizeName[]).map((s) => (
                <Chip key={s} label={t(`ann.size.${s}` as StringKey)} selected={size === s} onPress={() => setSize(s)} />
              ))}
            </View>
            {tool === 'text' ? <Text style={{ color: colors['text-muted'], fontSize: 14 }}>{t('ann.hintText')}</Text> : null}
          </>
        )}
      </View>

      <SignaturePad visible={pad} onSave={(s) => void newSignature(s)} onClose={() => setPad(false)} />
      <PromptModal
        visible={textAt !== null}
        title={t('ann.textPrompt')}
        multiline
        maxLength={500}
        onSubmit={(v) => {
          const at = textAt;
          setTextAt(null);
          if (at && v.trim()) void add({ kind: 'text', x: at[0], y: at[1], text: v.trim(), size: TEXT_SIZE[size], color: COLORS[color] });
        }}
        onCancel={() => setTextAt(null)}
      />
    </Screen>
  );
}

export default function AnnotateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <LockGuard docId={id}>
      <AnnotateBody id={id} />
    </LockGuard>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tools: { flexDirection: 'row', justifyContent: 'space-around' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 },
  dialog: { width: '100%', maxWidth: 360, padding: 16, gap: 12 },
});
