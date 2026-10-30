import Svg, { Polyline, Text as SvgText } from 'react-native-svg';
import type { Annotation } from '@/data/annotations';

const pts = (list: [number, number][], w: number, h: number) => list.map(([x, y]) => `${x * w},${y * h}`).join(' ');

/** Draws saved annotations on top of a page picture of the given size. Same maths as the PDF export. */
export function AnnotationLayer({ items, width, height }: { items: Annotation[]; width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute' }} pointerEvents="none">
      {items.map((a) => {
        const d = a.data;
        if (d.kind === 'draw' || d.kind === 'highlight') {
          const single = d.points.length === 1 ? [d.points[0], [d.points[0][0] + 0.0001, d.points[0][1]] as [number, number]] : d.points;
          return (
            <Polyline key={a.id} points={pts(single, width, height)} fill="none" stroke={d.color} strokeWidth={d.width * width} strokeOpacity={d.kind === 'highlight' ? 0.35 : 1} strokeLinecap="round" strokeLinejoin="round" />
          );
        }
        if (d.kind === 'text') {
          const size = Math.max(4, d.size * width);
          return d.text.split('\n').map((line, i) => (
            <SvgText key={`${a.id}-${i}`} x={d.x * width} y={d.y * height + size * (0.9 + i * 1.2)} fontSize={size} fill={d.color}>
              {line}
            </SvgText>
          ));
        }
        if (d.kind !== 'signature') return null;
        const boxW = d.w * width;
        const boxH = boxW * d.aspect;
        return d.strokes.map((s, i) => (
          <Polyline
            key={`${a.id}-${i}`}
            points={s.map(([sx, sy]) => `${d.x * width + sx * boxW},${d.y * height + sy * boxH}`).join(' ')}
            fill="none"
            stroke={d.color}
            strokeWidth={Math.max(1, boxW * 0.012)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ));
      })}
    </Svg>
  );
}
