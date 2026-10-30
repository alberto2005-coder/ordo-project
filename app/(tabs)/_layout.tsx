import { Redirect, Tabs } from 'expo-router';
import { FileText, Settings, Wrench } from 'lucide-react-native';
import { t, useLang } from '@/i18n';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors, layout } = useTheme();
  useLang();
  const onboarded = useApp((s) => s.settings?.onboarded === 1);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors['text-muted'],
        tabBarStyle: { backgroundColor: colors['surface-raised'], borderTopColor: colors.border, height: layout['tab-bar'] },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.library'), tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
      <Tabs.Screen name="tools" options={{ title: t('nav.tools'), tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings'), tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
    </Tabs>
  );
}
