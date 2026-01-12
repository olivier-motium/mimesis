/**
 * ANSI escape code utilities.
 *
 * Handles stripping ANSI codes from terminal output for clean display.
 */

/**
 * Comprehensive ANSI escape code regex.
 * Handles:
 * - CSI sequences (cursor movement, colors, etc.)
 * - OSC sequences (terminal titles, etc.)
 * - DEC private modes
 * - Character set selection
 * - Other escape sequences
 */
const ANSI_REGEX =
  /\x1b\[[?>=!]?[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012UK]|\x1b[78DEHM]|\x1b=|\x1b>/g;

/**
 * Strip ANSI escape codes from a string.
 *
 * @param str - String potentially containing ANSI codes
 * @returns Clean string with all ANSI codes removed
 */
export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}
