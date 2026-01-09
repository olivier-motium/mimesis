/**
 * xterm.js theme that matches Radix UI dark mode.
 *
 * Uses CSS variables from Radix themes for consistency.
 */

import type { ITheme } from "@xterm/xterm";

/**
 * Dark theme for xterm.js using Radix UI color tokens.
 */
export const radixDarkTheme: ITheme = {
  background: "#111113", // gray-1
  foreground: "#edeef0", // gray-12
  cursor: "#8e4ec6", // violet-9
  cursorAccent: "#14141a", // violet-1
  selectionBackground: "rgba(142, 78, 198, 0.3)", // violet-a5
  selectionForeground: "#edeef0",

  // Standard colors (normal)
  black: "#18181b", // gray-2
  red: "#e54666", // red-9
  green: "#30a46c", // green-9
  yellow: "#f5d90a", // yellow-9
  blue: "#3e63dd", // blue-9
  magenta: "#8e4ec6", // violet-9
  cyan: "#00a2c7", // cyan-9
  white: "#b4b8be", // gray-11

  // Standard colors (bright)
  brightBlack: "#4a4b55", // gray-8
  brightRed: "#ff6b6b", // red-10
  brightGreen: "#3bd671", // green-10
  brightYellow: "#ffec99", // yellow-10
  brightBlue: "#5472e4", // blue-10
  brightMagenta: "#a855f7", // violet-10
  brightCyan: "#22d3ee", // cyan-10
  brightWhite: "#edeef0", // gray-12
};

/**
 * Get CSS custom properties for terminal styling.
 */
export const terminalStyles = {
  fontFamily: "var(--code-font-family, 'JetBrains Mono', monospace)",
  fontSize: 14,
  lineHeight: 1.4,
};
