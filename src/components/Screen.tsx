import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export function Screen({ children }: { children: ReactNode }) {
  const { colors, layout } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, padding: layout['screen-padding'] }]}>
      {children}
    </View>
  );
}

export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty} accessible accessibilityLabel={text}>
      {icon}
      <Text style={[styles.emptyText, { color: colors['text-muted'] }]}>{text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
});
