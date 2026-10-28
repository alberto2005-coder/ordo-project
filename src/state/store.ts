import { create } from 'zustand';
import { getDb } from '@/data/expoDb';
import { getSettings, updateSettings, type Settings } from '@/data/library';
import { setLanguage } from '@/i18n';

interface AppState {
  ready: boolean;
  settings: Settings | null;
  load: () => Promise<void>;
  change: (patch: Partial<Settings>) => Promise<void>;
}

export const useApp = create<AppState>((set) => ({
  ready: false,
  settings: null,
  async load() {
    const db = await getDb();
    const settings = await getSettings(db);
    setLanguage(settings.language === 'es' || settings.language === 'en' ? settings.language : 'system');
    set({ settings, ready: true });
  },
  async change(patch) {
    const db = await getDb();
    await updateSettings(db, patch);
    const settings = await getSettings(db);
    if (patch.language !== undefined) {
      setLanguage(settings.language === 'es' || settings.language === 'en' ? settings.language : 'system');
    }
    set({ settings });
  },
}));
