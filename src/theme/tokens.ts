// Generated from tokens.json / tokens.dark.json. Edit the JSON, not this file.
export const light = {
  "bg": "#ffffff",
  "surface": "#f5f4f6",
  "surface-raised": "#ffffff",
  "border": "#dedce1",
  "border-input": "#7f7b88",
  "text": "#17151b",
  "text-muted": "#58545f",
  "accent": "#5b3a9e",
  "on-accent": "#ffffff",
  "accent-soft": "#ede6f8",
  "on-accent-soft": "#3f2573",
  "danger": "#b42318",
  "success": "#1c6b3f",
  "warning": "#8a5a00",
  "camera-bg": "#0e0d10",
  "on-camera": "#f2f4f2",
  "scan-guide": "#cdb6ff"
} as const;
export const dark = {
  "bg": "#121014",
  "surface": "#1a171e",
  "surface-raised": "#221e27",
  "border": "#322d38",
  "border-input": "#8d8896",
  "text": "#efecf2",
  "text-muted": "#a7a2b0",
  "accent": "#b79cf0",
  "on-accent": "#1d0f3a",
  "accent-soft": "#2f2250",
  "on-accent-soft": "#e2d6fb",
  "danger": "#ff8a7d",
  "success": "#6fd49a",
  "warning": "#f0b954",
  "camera-bg": "#0e0d10",
  "on-camera": "#f2f4f2",
  "scan-guide": "#cdb6ff"
} as const;
export type ColorRole = keyof typeof light;
export const type = {
  "xs": {
    "size": 12,
    "line": 16,
    "weight": 500
  },
  "sm": {
    "size": 14,
    "line": 20,
    "weight": 400
  },
  "base": {
    "size": 16,
    "line": 24,
    "weight": 400
  },
  "lg": {
    "size": 20,
    "line": 28,
    "weight": 600
  },
  "xl": {
    "size": 28,
    "line": 34,
    "weight": 700
  }
} as const;
export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const radius = {"sm": 8, "md": 12, "lg": 20, "pill": 999} as const;
export const layout = {"tap-target": 48, "screen-padding": 16, "tab-bar": 64, "header": 56, "breakpoint-tablet": 600} as const;
