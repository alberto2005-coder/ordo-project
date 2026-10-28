import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import en from './en.json';
import es from './es.json';

export type StringKey = keyof typeof es;
export type Lang = 'es' | 'en';

const tables: Record<Lang, Record<string, string>> = { es, en };

function systemLang(): Lang {
  const code = getLocales()[0]?.languageCode;
  return code === 'es' ? 'es' : 'en';
}

let current: Lang = systemLang();
const listeners = new Set<() => void>();

/** 'system' follows the phone; 'es' or 'en' is the user's own choice from settings. */
export function setLanguage(choice: 'system' | Lang) {
  current = choice === 'system' ? systemLang() : choice;
  listeners.forEach((l) => l());
}

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let text = tables[current][key] ?? tables.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text;
}

/** Re-renders a component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
