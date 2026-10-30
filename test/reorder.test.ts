import { describe, expect, it } from 'vitest';
import { dropIndex, moveItem, slideOf } from '../src/data/reorder';

describe('drag to reorder', () => {
  it('computes the drop position and clamps it', () => {
    expect(dropIndex(2, 0, 96, 5)).toBe(2);
    expect(dropIndex(2, 100, 96, 5)).toBe(3);
    expect(dropIndex(2, 40, 96, 5)).toBe(2);
    expect(dropIndex(2, 50, 96, 5)).toBe(3);
    expect(dropIndex(2, -300, 96, 5)).toBe(0);
    expect(dropIndex(2, 900, 96, 5)).toBe(4);
  });
  it('moves an item without touching the others', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
  it('slides the rows in between out of the way, and agrees with moveItem', () => {
    const list = ['a', 'b', 'c', 'd', 'e'];
    for (const [from, to] of [[0, 3], [3, 0], [1, 4], [4, 2], [2, 2]]) {
      const moved = moveItem(list, from, to);
      list.forEach((item, i) => {
        if (i === from) return;
        expect(moved.indexOf(item)).toBe(i + slideOf(i, from, to));
      });
      expect(moved[to]).toBe(list[from]);
    }
  });
});
