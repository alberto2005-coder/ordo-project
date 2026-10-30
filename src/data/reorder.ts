/** Where a dragged row ends up: it started at `from`, was dragged `dy` pixels, rows are `rowH` pixels tall. */
export function dropIndex(from: number, dy: number, rowH: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.round(from + dy / rowH)));
}

/** The list with the item at `from` moved to `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(0, to), next.length), 0, item);
  return next;
}

/** How far row `i` should slide (in rows: -1, 0 or 1) while row `from` is being dragged over `to`. */
export function slideOf(i: number, from: number, to: number): -1 | 0 | 1 {
  if (i === from) return 0;
  if (from < to && i > from && i <= to) return -1;
  if (from > to && i >= to && i < from) return 1;
  return 0;
}
