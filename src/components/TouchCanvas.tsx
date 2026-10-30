import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { Point } from '@/data/annotations';

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** A surface that turns finger movement into points between 0 and 1 (fractions of its own size).
 *  `stroke` mode reports a whole line when the finger lifts; `tap` mode reports one point. */
export function TouchCanvas({
  width,
  height,
  mode,
  liveColor,
  liveWidth,
  liveOpacity = 1,
  onStroke,
  onTap,
  children,
  label,
}: {
  width: number;
  height: number;
  mode: 'stroke' | 'tap';
  liveColor: string;
  liveWidth: number;
  liveOpacity?: number;
  onStroke?: (points: Point[]) => void;
  onTap?: (point: Point) => void;
  children?: ReactNode;
  label?: string;
}) {
  const [live, setLive] = useState<Point[]>([]);
  const points = useRef<Point[]>([]);
  const cb = useRef({ mode, onStroke, onTap, width, height });
  cb.current = { mode, onStroke, onTap, width, height };

  const responder = useMemo(() => {
    const at = (e: { nativeEvent: { locationX: number; locationY: number } }): Point => [
      clamp(e.nativeEvent.locationX / (cb.current.width || 1)),
      clamp(e.nativeEvent.locationY / (cb.current.height || 1)),
    ];
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        points.current = [at(e)];
        if (cb.current.mode === 'stroke') setLive([...points.current]);
      },
      onPanResponderMove: (e) => {
        if (cb.current.mode !== 'stroke') return;
        const p = at(e);
        const last = points.current[points.current.length - 1];
        // Skip points closer than about a pixel: keeps stored lines small and smooth enough.
        if (Math.abs(p[0] - last[0]) * cb.current.width + Math.abs(p[1] - last[1]) * cb.current.height < 2) return;
        if (points.current.length < 4000) points.current.push(p);
        setLive([...points.current]);
      },
      onPanResponderRelease: (e) => {
        const done = points.current;
        points.current = [];
        setLive([]);
        if (!done.length) return;
        if (cb.current.mode === 'stroke') cb.current.onStroke?.(done);
        else cb.current.onTap?.(at(e));
      },
      onPanResponderTerminate: () => {
        points.current = [];
        setLive([]);
      },
    });
  }, []);

  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityLabel={label}
      style={{ width, height }}
      onLayout={(_: LayoutChangeEvent) => {}}
    >
      {children}
      {live.length > 0 ? (
        <Svg width={width} height={height} style={{ position: 'absolute' }} pointerEvents="none">
          <Polyline
            points={live.map(([x, y]) => `${x * width},${y * height}`).join(' ')}
            fill="none"
            stroke={liveColor}
            strokeWidth={liveWidth}
            strokeOpacity={liveOpacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}
