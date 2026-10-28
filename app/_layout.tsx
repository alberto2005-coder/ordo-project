import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLang, t } from '@/i18n';
import { clearExports } from '@/services/files';
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
        <Stack.Screen name="document/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="document/[id]/pages" options={{ title: t('stub.soon') }} />
        <Stack.Screen name="ocr/[id]" options={{ title: t('stub.soon') }} />
        <Stack.Screen name="annotate/[id]" options={{ title: t('stub.soon') }} />
        <Stack.Screen name="pdf-tools" options={{ title: t('stub.soon') }} />
        <Stack.Screen name="folder/[id]" options={{ title: t('stub.soon') }} />
        <Stack.Screen name="lock" options={{ title: t('stub.soon') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { ready, settings, load } = useApp();
  useEffect(() => {
    clearExports();
    void load();
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
