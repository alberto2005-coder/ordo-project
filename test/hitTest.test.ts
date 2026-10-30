import { describe, expect, it } from 'vitest';
import type { Annotation } from '../src/data/annotations';
import { hitAnnotation } from '../src/data/hitTest';

const ann = (id: string, data: Annotation['data']): Annotation => ({ id, page_id: 'p', created_at: '', data });
const W = 400;
const H = 600;
const items: Annotation[] = [
  ann('line', { kind: 'draw', color: '#000000', width: 0.01, points: [[0.1, 0.1], [0.5, 0.1]] }),
  ann('dot', { kind: 'draw', color: '#000000', width: 0.01, points: [[0.8, 0.8]] }),
  ann('text', { kind: 'text', x: 0.1, y: 0.5, text: 'Hola', size: 0.05, color: '#000000' }),
  ann('sig', { kind: 'signature', x: 0.5, y: 0.5, w: 0.3, aspect: 0.4, color: '#000000', strokes: [[[0, 0], [1, 1]]] }),
];

describe('hit test', () => {
  it('finds a stroke near its line and misses far from it', () => {
    expect(hitAnnotation(items, [0.3, 0.1], W, H)).toBe('line');
    expect(hitAnnotation(items, [0.3, 0.12], W, H)).toBe('line');
    expect(hitAnnotation(items, [0.3, 0.3], W, H)).toBeNull();
  });
  it('finds a single-point dot', () => {
    expect(hitAnnotation(items, [0.8, 0.8], W, H)).toBe('dot');
    expect(hitAnnotation(items, [0.2, 0.9], W, H)).toBeNull();
  });
  it('finds text and signature boxes', () => {
    expect(hitAnnotation(items, [0.15, 0.51], W, H)).toBe('text');
    expect(hitAnnotation(items, [0.6, 0.55], W, H)).toBe('sig');
  });
  it('prefers the newest annotation where they overlap', () => {
    const both = [
      ann('old', { kind: 'draw', color: '#000000', width: 0.02, points: [[0.2, 0.2], [0.6, 0.2]] }),
      ann('new', { kind: 'draw', color: '#ff0000', width: 0.02, points: [[0.2, 0.2], [0.6, 0.2]] }),
    ];
    expect(hitAnnotation(both, [0.4, 0.2], W, H)).toBe('new');
    expect(hitAnnotation([], [0.4, 0.2], W, H)).toBeNull();
  });
});
