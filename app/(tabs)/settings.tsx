import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import type { ExportQuality, PdfPageSize, Settings } from '@/data/library';
import { t, useLang, type StringKey } from '@/i18n';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

function Choice<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.heading, { color: colors['text-muted'] }]}>{title}</Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[
                styles.chip,
                {
                  minHeight: layout['tap-target'],
                  borderRadius: radius.md,
                  borderColor: on ? colors.accent : colors.border,
                  backgroundColor: on ? colors['accent-soft'] : colors.surface,
                },
              ]}
            >
              <Text style={{ color: on ? colors['on-accent-soft'] : colors.text, fontSize: 14, fontWeight: '500' }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  useLang();
  const settings = useApp((s) => s.settings);
  const change = useApp((s) => s.change);
  if (!settings) return null;
  const set = (patch: Partial<Settings>) => void change(patch);
  const label = (k: StringKey) => t(k);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 24, paddingBottom: 32 }}>
        <Choice
          title={t('settings.language')}
          value={settings.language === 'es' || settings.language === 'en' ? settings.language : 'system'}
          options={[
            { value: 'system', label: label('settings.language.system') },
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(v) => set({ language: v })}
        />
        <Choice
          title={t('settings.theme')}
          value={settings.theme}
          options={[
            { value: 'system', label: label('settings.theme.system') },
            { value: 'light', label: label('settings.theme.light') },
            { value: 'dark', label: label('settings.theme.dark') },
          ]}
          onChange={(v) => set({ theme: v })}
        />
        <Choice<ExportQuality>
          title={t('export.quality')}
          value={settings.export_quality}
          options={[
            { value: 'low', label: label('export.quality.low') },
            { value: 'medium', label: label('export.quality.medium') },
            { value: 'high', label: label('export.quality.high') },
          ]}
          onChange={(v) => set({ export_quality: v })}
        />
        <Choice<PdfPageSize>
          title={t('export.size')}
          value={settings.pdf_page_size}
          options={[
            { value: 'A4', label: 'A4' },
            { value: 'Letter', label: 'Letter' },
            { value: 'fit', label: 'Auto' },
          ]}
          onChange={(v) => set({ pdf_page_size: v })}
        />
        <Text style={[styles.privacy, { color: colors['text-muted'] }]}>{t('settings.privacy')}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  heading: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  privacy: { fontSize: 14, lineHeight: 20 },
});
