import { describe, it, expect } from "vitest";

// Replicate the stripAnsi function for testing
// Comprehensive pattern handles: CSI sequences, OSC sequences, DEC private modes, character sets
// eslint-disable-next-line no-control-regex
const ANSI_REGEX =
  /\x1b\[[?>=!]?[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012UK]|\x1b[78DEHM]|\x1b=|\x1b>/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

describe("stripAnsi", () => {
  it("strips basic CSI sequences (colors)", () => {
    expect(stripAnsi("\x1b[32mgreen\x1b[0m")).toBe("green");
    expect(stripAnsi("\x1b[1;31mbold red\x1b[0m")).toBe("bold red");
  });

  it("strips DEC private mode sequences", () => {
    expect(stripAnsi("\x1b[>1v")).toBe(""); // Device attributes (the bug!)
    expect(stripAnsi("\x1b[?25h")).toBe(""); // Show cursor
    expect(stripAnsi("\x1b[?25l")).toBe(""); // Hide cursor
    expect(stripAnsi("\x1b[?1049h")).toBe(""); // Alternate screen buffer
    expect(stripAnsi("\x1b[?1049l")).toBe(""); // Exit alternate screen
  });

  it("strips cursor movement sequences", () => {
    expect(stripAnsi("\x1b[5A")).toBe(""); // Cursor up
    expect(stripAnsi("\x1b[10B")).toBe(""); // Cursor down
    expect(stripAnsi("\x1b[3C")).toBe(""); // Cursor forward
    expect(stripAnsi("\x1b[2D")).toBe(""); // Cursor back
    expect(stripAnsi("\x1b[H")).toBe(""); // Cursor home
    expect(stripAnsi("\x1b[10;20H")).toBe(""); // Cursor position
  });

  it("strips erase sequences", () => {
    expect(stripAnsi("\x1b[J")).toBe(""); // Erase below
    expect(stripAnsi("\x1b[2J")).toBe(""); // Erase screen
    expect(stripAnsi("\x1b[K")).toBe(""); // Erase to end of line
    expect(stripAnsi("\x1b[2K")).toBe(""); // Erase line
  });

  it("strips OSC sequences (window title)", () => {
    expect(stripAnsi("\x1b]0;My Title\x07")).toBe("");
    expect(stripAnsi("\x1b]2;Another Title\x07")).toBe("");
  });

  it("strips character set selections", () => {
    expect(stripAnsi("\x1b(B")).toBe(""); // ASCII
    expect(stripAnsi("\x1b(0")).toBe(""); // Line drawing
    expect(stripAnsi("\x1b)B")).toBe(""); // G1 ASCII
  });

  it("strips cursor save/restore and line ops", () => {
    expect(stripAnsi("\x1b7")).toBe(""); // Save cursor
    expect(stripAnsi("\x1b8")).toBe(""); // Restore cursor
    expect(stripAnsi("\x1bD")).toBe(""); // Index
    expect(stripAnsi("\x1bE")).toBe(""); // Next line
    expect(stripAnsi("\x1bM")).toBe(""); // Reverse index
  });

  it("strips keypad mode sequences", () => {
    expect(stripAnsi("\x1b=")).toBe(""); // Application keypad
    expect(stripAnsi("\x1b>")).toBe(""); // Normal keypad
  });

  it("preserves normal text", () => {
    expect(stripAnsi("Hello World")).toBe("Hello World");
    expect(stripAnsi("No escapes here")).toBe("No escapes here");
    expect(stripAnsi("")).toBe("");
  });

  it("handles mixed content (real Commander output scenario)", () => {
    // Simulates the garbled output from screenshot
    const input =
      '\x1b[32m> \x1b[0mTry \x1b[>1v"how does <filepath> work?"';
    expect(stripAnsi(input)).toBe('> Try "how does <filepath> work?"');
  });

  it("handles permission prompt TUI elements", () => {
    // Claude Code permission prompts contain various escape sequences
    const input = "\x1b[?25l\x1b[2K>> bypass permissions\x1b[?25h";
    expect(stripAnsi(input)).toBe(">> bypass permissions");
  });

  it("handles multiple sequences in a row", () => {
    const input = "\x1b[H\x1b[2J\x1b[32mClean\x1b[0m";
    expect(stripAnsi(input)).toBe("Clean");
  });
});
