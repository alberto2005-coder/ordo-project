import { useRouter } from 'expo-router';
import { FileText, ShieldCheck, WifiOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { t, useLang } from '@/i18n';
import { useApp } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

export default function Onboarding() {
  const router = useRouter();
  const { colors } = useTheme();
  useLang();
  const change = useApp((s) => s.change);

  async function start() {
    await change({ onboarded: 1 });
    router.replace('/');
  }

  const points = [
    { icon: <WifiOff size={28} color={colors.accent} />, text: t('onboarding.offline') },
    { icon: <ShieldCheck size={28} color={colors.accent} />, text: t('onboarding.noAccount') },
    { icon: <FileText size={28} color={colors.accent} />, text: t('onboarding.camera') },
  ];

  return (
    <Screen>
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{t('onboarding.title')}</Text>
        <Text style={[styles.text, { color: colors['text-muted'] }]}>{t('onboarding.body')}</Text>
        <View style={styles.points}>
          {points.map((p) => (
            <View key={p.text} style={styles.point} accessible accessibilityLabel={p.text}>
              {p.icon}
              <Text style={[styles.pointText, { color: colors.text }]}>{p.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <Button label={t('onboarding.start')} onPress={() => void start()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 16 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  text: { fontSize: 16, lineHeight: 24 },
  points: { gap: 16, marginTop: 16 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pointText: { fontSize: 16, lineHeight: 24, flex: 1 },
});
