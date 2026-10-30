import type { Annotation, Point } from './annotations';

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The topmost annotation under a tap, or null. `p` is a fraction of the page; sizes are the page picture's size in pixels,
 *  so `slop` (a finger's width) is in pixels. Newer annotations win over older ones. */
export function hitAnnotation(items: Annotation[], p: Point, width: number, height: number, slop = 16): string | null {
  const px: [number, number] = [p[0] * width, p[1] * height];
  const toPx = (q: Point): [number, number] => [q[0] * width, q[1] * height];
  for (let i = items.length - 1; i >= 0; i--) {
    const a = items[i];
    const d = a.data;
    if (d.kind === 'draw' || d.kind === 'highlight') {
      const reach = slop + (d.width * width) / 2;
      const pts = d.points.map(toPx);
      const near = pts.length === 1 ? Math.hypot(px[0] - pts[0][0], px[1] - pts[0][1]) <= reach : pts.some((q, k) => k > 0 && segDist(px, pts[k - 1], q) <= reach);
      if (near) return a.id;
    } else if (d.kind === 'text') {
      const size = Math.max(4, d.size * width);
      const lines = d.text.split('\n');
      const w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
      const h = lines.length * size * 1.2;
      const [x, y] = toPx([d.x, d.y]);
      if (px[0] >= x - slop && px[0] <= x + w + slop && px[1] >= y - slop && px[1] <= y + h + slop) return a.id;
    } else if (d.kind === 'signature') {
      const bw = d.w * width;
      const bh = bw * d.aspect;
      const [x, y] = toPx([d.x, d.y]);
      if (px[0] >= x - slop && px[0] <= x + bw + slop && px[1] >= y - slop && px[1] <= y + bh + slop) return a.id;
    }
  }
  return null;
}
