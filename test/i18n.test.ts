import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import es from '../src/i18n/es.json';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' || f === 'native' ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('strings', () => {
  it('Spanish and English have exactly the same keys, none empty, with the same placeholders', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(es) as (keyof typeof es)[]) {
      expect(es[k].trim(), k).not.toBe('');
      expect(en[k].trim(), k).not.toBe('');
      expect(placeholders(es[k]), `placeholders of ${k}`).toEqual(placeholders(en[k]));
    }
  });

  it('every string the code asks for exists', () => {
    const used = new Set<string>();
    for (const f of [...sources('src'), ...sources('app')]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in es));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(100);
  });

  it('every dynamic filter / colour label the screens build from a name exists', () => {
    for (const f of ['original', 'enhanced', 'bw', 'gray']) expect(es).toHaveProperty(`edit.filter.${f}`);
    for (const c of ['black', 'blue', 'red', 'green', 'yellow']) expect(es).toHaveProperty(`ann.color.${c}`);
    for (const s of ['s', 'm', 'l']) expect(es).toHaveProperty(`ann.size.${s}`);
    for (const q of ['low', 'medium', 'high']) expect(es).toHaveProperty(`export.quality.${q}`);
  });
});
