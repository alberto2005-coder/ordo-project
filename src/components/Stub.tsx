import { Construction } from 'lucide-react-native';
import { EmptyState, Screen } from '@/components/Screen';
import { t, useLang } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

/** Placeholder for screens that are routed but not built yet (see build-log.md). */
export function Stub() {
  const { colors } = useTheme();
  useLang();
  return (
    <Screen>
      <EmptyState icon={<Construction size={48} color={colors['text-muted']} />} text={t('stub.soon')} />
    </Screen>
  );
}
