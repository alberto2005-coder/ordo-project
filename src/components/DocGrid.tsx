import { Image } from 'expo-image';
import { Check, Lock } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DocumentSummary } from '@/data/library';
import { t } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';

export function DocGrid({
  docs,
  onOpen,
  header,
  view = 'grid',
  selected,
  onSelect,
}: {
  docs: DocumentSummary[];
  onOpen: (d: DocumentSummary) => void;
  header?: React.ReactElement;
  view?: 'grid' | 'list';
  /** Ids chosen in selection mode. When set (even if empty), taps toggle instead of opening. */
  selected?: Set<string>;
  /** Long press starts selection; taps in selection mode toggle. */
  onSelect?: (d: DocumentSummary) => void;
}) {
  const { colors, radius } = useTheme();
  const list = view === 'list';
  return (
    <FlatList
      key={view}
      data={docs}
      keyExtractor={(d) => d.id}
      numColumns={list ? 1 : 2}
      ListHeaderComponent={header}
      columnWrapperStyle={list ? undefined : { gap: 12 }}
      contentContainerStyle={{ gap: 12, paddingVertical: 12, paddingBottom: 96 }}
      extraData={selected}
      renderItem={({ item }) => {
        const pages = item.page_count === 1 ? t('doc.page') : t('doc.pages', { n: item.page_count });
        const locked = item.is_locked === 1;
        const on = !!selected?.has(item.id);
        return (
          <Pressable
            style={[
              list ? styles.row : styles.card,
              { backgroundColor: on ? colors['accent-soft'] : colors['surface-raised'], borderColor: on ? colors.accent : colors.border, borderRadius: radius.md },
            ]}
            accessibilityRole={selected ? 'checkbox' : 'button'}
            accessibilityState={selected ? { checked: on } : undefined}
            accessibilityLabel={`${item.title}, ${pages}${locked ? ', ' + t('library.locked') : ''}`}
            onPress={() => (selected ? onSelect?.(item) : onOpen(item))}
            onLongPress={() => onSelect?.(item)}
            delayLongPress={350}
          >
            <View style={[list ? styles.thumbSmall : styles.thumb, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
              {item.thumbnail_path ? <Image source={{ uri: item.thumbnail_path }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={locked ? 40 : 0} /> : null}
              {locked ? (
                <View style={styles.center}>
                  <Lock size={list ? 18 : 28} color={colors['text-muted']} />
                </View>
              ) : null}
              {on ? (
                <View style={[styles.check, { backgroundColor: colors.accent }]}>
                  <Check size={16} color={colors['on-accent']} />
                </View>
              ) : null}
            </View>
            <View style={list ? { flex: 1 } : undefined}>
              <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: colors['text-muted'] }]}>{pages}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 8, gap: 12 },
  thumb: { height: 120, overflow: 'hidden', marginBottom: 4, alignItems: 'center', justifyContent: 'center' },
  thumbSmall: { width: 56, height: 72, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', top: 4, left: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  meta: { fontSize: 14, lineHeight: 20 },
});
