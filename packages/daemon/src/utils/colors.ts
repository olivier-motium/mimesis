/**
 * ANSI color codes for terminal output.
 * Shared across CLI tools for consistent styling.
 */

export const colors = {
  // Reset
  reset: "\x1b[0m",

  // Modifiers
  dim: "\x1b[2m",
  bold: "\x1b[1m",

  // Standard colors
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",

  // Bright/gray
  gray: "\x1b[90m",
} as const;

export type ColorKey = keyof typeof colors;
