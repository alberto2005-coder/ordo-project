import '@/polyfills';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { t, useLang } from '@/i18n';
import { getDb } from '@/data/expoDb';
import { purgeOld } from '@/data/trash';
import { clearTemporary, removeFiles } from '@/services/files';
import { useApp } from '@/state/store';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Shell() {
  const { colors, scheme } = useTheme();
  useLang();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="document/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="document/[id]/pages" options={{ title: t('pages.title') }} />
        <Stack.Screen name="page/[id]" options={{ title: t('edit.title') }} />
        <Stack.Screen name="ocr/[id]" options={{ title: t('ocr.title') }} />
        <Stack.Screen name="annotate/[id]" options={{ title: t('ann.title') }} />
        <Stack.Screen name="folder/[id]" options={{ title: '' }} />
        <Stack.Screen name="view/[id]" options={{ title: '' }} />
        <Stack.Screen name="backup" options={{ title: t('backup.title') }} />
        <Stack.Screen name="camera" options={{ headerShown: false }} />
        <Stack.Screen name="trash" options={{ title: t('trash.title') }} />
        <Stack.Screen name="export/[id]" options={{ title: t('export.title') }} />
        <Stack.Screen name="lock" options={{ title: t('lock.title') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { ready, settings, load } = useApp();
  useEffect(() => {
    clearTemporary();
    void load();
    // Old trash is emptied on start.
    void (async () => removeFiles(await purgeOld(await getDb())))();
  }, [load]);

  if (!ready || !settings) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider choice={settings.theme}>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
