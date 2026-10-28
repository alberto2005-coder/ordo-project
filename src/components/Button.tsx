import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors, radius, layout } = useTheme();
  const palette = {
    primary: { bg: colors.accent, fg: colors['on-accent'] },
    secondary: { bg: colors['accent-soft'], fg: colors['on-accent-soft'] },
    ghost: { bg: 'transparent', fg: colors.accent },
    danger: { bg: colors.danger, fg: colors.bg },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          minHeight: layout['tap-target'],
          borderRadius: radius.pill,
          opacity: off ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : null}
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
});
