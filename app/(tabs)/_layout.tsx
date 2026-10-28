import { Tabs } from 'expo-router';
import { FileText, Settings } from 'lucide-react-native';
import { t, useLang } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors, layout } = useTheme();
  useLang();
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
      <Tabs.Screen
        name="index"
        options={{ title: t('nav.library'), tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('nav.settings'), tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  );
}
