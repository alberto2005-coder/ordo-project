import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, layout, light, radius, space, type ColorRole } from './tokens';

export type Colors = Record<ColorRole, string>;
export interface Theme {
  colors: Colors;
  scheme: 'light' | 'dark';
  space: typeof space;
  radius: typeof radius;
  layout: typeof layout;
}

const Ctx = createContext<Theme | null>(null);

export function ThemeProvider({
  choice,
  children,
}: {
  choice: 'system' | 'light' | 'dark';
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme = choice === 'system' ? (system === 'dark' ? 'dark' : 'light') : choice;
  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: (scheme === 'dark' ? dark : light) as Colors,
      space,
      radius,
      layout,
    }),
    [scheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
