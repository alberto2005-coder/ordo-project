import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';

/** A round button with an icon. The label is what screen readers say. */
export function IconButton({ label, icon, onPress, disabled, active }: { label: string; icon: ReactNode; onPress: () => void; disabled?: boolean; active?: boolean }) {
  const { colors, layout } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        { minWidth: layout['tap-target'], minHeight: layout['tap-target'], backgroundColor: active ? colors['accent-soft'] : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon}
      <Text numberOfLines={1} style={{ color: active ? colors['on-accent-soft'] : colors['text-muted'], fontSize: 12, lineHeight: 16 }}>{label}</Text>
    </Pressable>
  );
}

/** A choice chip, used in rows of options (filters, sizes, tags). */
export function Chip({ label, selected, onPress, radio = true }: { label: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  const { colors, radius, layout } = useTheme();
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityState={radio ? { checked: selected } : { selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, { minHeight: layout['tap-target'], borderRadius: radius.md, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors['accent-soft'] : colors.surface }]}
    >
      <Text style={{ color: selected ? colors['on-accent-soft'] : colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export interface SheetItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

/** A menu that slides up from the bottom. Tapping outside or the system back gesture closes it. */
export function ActionSheet({ visible, title, items, onClose }: { visible: boolean; title?: string; items: SheetItem[]; onClose: () => void }) {
  const { colors, radius, layout } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button">
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { backgroundColor: colors['surface-raised'], borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}
          accessibilityViewIsModal
        >
          {title ? <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors['text-muted'] }]}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 440 }}>
            {items.map((it) => (
              <Pressable
                key={it.label}
                accessibilityRole="button"
                accessibilityLabel={it.label}
                onPress={() => {
                  onClose();
                  it.onPress();
                }}
                style={({ pressed }) => [styles.sheetRow, { minHeight: layout['tap-target'], backgroundColor: pressed ? colors.surface : 'transparent' }]}
              >
                {it.icon}
                <Text style={{ color: it.destructive ? colors.danger : colors.text, fontSize: 16, lineHeight: 24 }}>{it.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A one-field dialog. Works the same on iOS and Android (Alert.prompt is iOS only). */
export function PromptModal({
  visible,
  title,
  message,
  initial = '',
  placeholder,
  secure,
  keyboardType,
  maxLength,
  multiline,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  multiline?: boolean;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const { colors, radius, layout } = useTheme();
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <View style={[styles.dialog, { backgroundColor: colors['surface-raised'], borderRadius: radius.lg }]} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '600' }}>{title}</Text>
          {message ? <Text style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20 }}>{message}</Text> : null}
          <TextInput
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors['text-muted']}
            accessibilityLabel={title}
            secureTextEntry={secure}
            keyboardType={keyboardType}
            maxLength={maxLength}
            multiline={multiline}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={multiline ? undefined : () => onSubmit(value)}
            style={{ borderWidth: 1, borderColor: colors['border-input'], borderRadius: radius.md, minHeight: layout['tap-target'], paddingHorizontal: 12, color: colors.text, fontSize: 16, textAlignVertical: multiline ? 'top' : 'center' }}
          />
          <View style={{ gap: 8 }}>
            <Button label={submitLabel ?? t('common.ok')} onPress={() => onSubmit(value)} />
            <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text accessibilityRole="header" style={{ color: colors['text-muted'], fontSize: 14, lineHeight: 20, fontWeight: '500' }}>{children}</Text>;
}

const styles = StyleSheet.create({
  iconBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, gap: 2 },
  chip: { paddingHorizontal: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { paddingTop: 8, paddingBottom: 24 },
  sheetTitle: { paddingHorizontal: 20, paddingVertical: 8, fontSize: 14, lineHeight: 20 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  center: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { padding: 20, gap: 12 },
});
