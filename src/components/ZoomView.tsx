import { Image } from 'expo-image';
import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import { AnnotationLayer } from './AnnotationLayer';
import type { Annotation } from '@/data/annotations';

const MAX_SCALE = 6;
const dist = (t: readonly { pageX: number; pageY: number }[]) => Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);

/** A picture you can pinch to zoom, drag when zoomed, and double-tap to zoom in or out. */
export function ZoomView({ uri, annotations, aspect, children }: { uri: string; annotations?: Annotation[]; aspect: number; children?: ReactNode }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const cur = useRef(view);
  cur.current = view;
  const boxRef = useRef(box);
  boxRef.current = box;
  const gesture = useRef({ startS: 1, startX: 0, startY: 0, startDist: 0, lastTap: 0, moved: false });

  const clampView = (s: number, x: number, y: number) => {
    const sc = Math.min(MAX_SCALE, Math.max(1, s));
    const mx = ((sc - 1) * boxRef.current.w) / 2;
    const my = ((sc - 1) * boxRef.current.h) / 2;
    return { s: sc, x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const g = gesture.current;
        g.startS = cur.current.s;
        g.startX = cur.current.x;
        g.startY = cur.current.y;
        g.startDist = e.nativeEvent.touches.length >= 2 ? dist(e.nativeEvent.touches) : 0;
        g.moved = false;
      },
      onPanResponderMove: (e, d) => {
        const g = gesture.current;
        const touches = e.nativeEvent.touches;
        if (Math.abs(d.dx) + Math.abs(d.dy) > 6) g.moved = true;
        if (touches.length >= 2) {
          if (!g.startDist) {
            g.startDist = dist(touches);
            g.startS = cur.current.s;
          }
          g.moved = true;
          setView(clampView((g.startS * dist(touches)) / g.startDist, cur.current.x, cur.current.y));
        } else if (cur.current.s > 1) {
          setView(clampView(cur.current.s, g.startX + d.dx, g.startY + d.dy));
        }
      },
      onPanResponderRelease: () => {
        const g = gesture.current;
        g.startDist = 0;
        if (g.moved) return;
        const now = Date.now();
        if (now - g.lastTap < 300) setView(cur.current.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 });
        g.lastTap = now;
      },
    }),
  ).current;

  const w = Math.max(0, Math.min(box.w, box.h * aspect));
  const h = aspect ? w / aspect : 0;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
      {w > 0 ? (
        <View style={{ width: w, height: h, transform: [{ translateX: view.x }, { translateY: view.y }, { scale: view.s }] }}>
          <Image source={{ uri }} style={{ width: w, height: h }} contentFit="fill" />
          {annotations?.length ? <AnnotationLayer items={annotations} width={w} height={h} /> : null}
          {children}
        </View>
      ) : null}
    </View>
  );
}
