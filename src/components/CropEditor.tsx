import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { t } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { isConvex, polygonArea, type Corners } from '@/image/warp';

const HANDLE = 44;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The picture with four handles the person drags onto the page's corners. A move that would twist the shape is ignored. */
export function CropEditor({ uri, corners, onChange }: { uri: string; corners: Corners; onChange: (c: Corners) => void }) {
  const { colors } = useTheme();
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState(0.72);
  const live = useRef(corners);
  live.current = corners;
  const size = useRef({ w: 1, h: 1 });

  useEffect(() => {
    RNImage.getSize(uri, (w, h) => setAspect(w / h), () => {});
  }, [uri]);

  const boxW = Math.max(0, Math.min(area.w, area.h * aspect));
  const boxH = aspect ? boxW / aspect : 0;
  size.current = { w: boxW || 1, h: boxH || 1 };

  const responders = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => {
        let start: [number, number] = [0, 0];
        return PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            start = [...live.current[i]] as [number, number];
          },
          onPanResponderMove: (_, g) => {
            const next = live.current.map((p) => [...p]) as Corners;
            next[i] = [clamp(start[0] + g.dx / size.current.w), clamp(start[1] + g.dy / size.current.h)];
            if (isConvex(next) && polygonArea(next) >= 0.02) onChange(next);
          },
        });
      }),
    [onChange],
  );

  const labels = [t('crop.topLeft'), t('crop.topRight'), t('crop.bottomRight'), t('crop.bottomLeft')];

  return (
    <View style={styles.wrap} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {boxW > 0 ? (
        <View style={{ width: boxW, height: boxH }}>
          <Image source={{ uri }} style={{ width: boxW, height: boxH }} contentFit="fill" />
          <Svg width={boxW} height={boxH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polygon points={corners.map(([x, y]) => `${x * boxW},${y * boxH}`).join(' ')} fill={colors.accent} fillOpacity={0.15} stroke={colors.accent} strokeWidth={2} />
          </Svg>
          {corners.map(([x, y], i) => (
            <View
              key={i}
              {...responders[i].panHandlers}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={labels[i]}
              accessibilityActions={[{ name: 'increment', label: t('crop.moveIn') }, { name: 'decrement', label: t('crop.moveOut') }]}
              onAccessibilityAction={(e) => {
                // A non-touch way to move a corner: nudge it towards or away from the centre.
                const cx = corners.reduce((a, p) => a + p[0], 0) / 4;
                const cy = corners.reduce((a, p) => a + p[1], 0) / 4;
                const k = e.nativeEvent.actionName === 'increment' ? -0.02 : 0.02;
                const next = corners.map((p) => [...p]) as Corners;
                next[i] = [clamp(x + (x - cx) * k * 5), clamp(y + (y - cy) * k * 5)];
                if (isConvex(next) && polygonArea(next) >= 0.02) onChange(next);
              }}
              style={[styles.handle, { left: x * boxW - HANDLE / 2, top: y * boxH - HANDLE / 2 }]}
            >
              <View style={[styles.dot, { backgroundColor: colors['on-accent'], borderColor: colors.accent }]} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Keep the handles away from the screen edges: Android's back gesture starts there and would
  // close the editor instead of dragging the corner.
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
});
