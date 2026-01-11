/**
 * InputHistory - Manages command history for up/down arrow navigation.
 *
 * Stores history in memory (could be persisted to localStorage).
 */

// ============================================================================
// Class
// ============================================================================

export class InputHistory {
  private history: string[] = [];
  private index: number = -1;
  private maxSize: number = 100;

  /**
   * Add a new entry to history.
   * Deduplicates consecutive identical entries.
   */
  add(entry: string): void {
    const trimmed = entry.trim();
    if (!trimmed) return;

    // Don't add if same as last entry
    if (this.history.length > 0 && this.history[this.history.length - 1] === trimmed) {
      return;
    }

    this.history.push(trimmed);

    // Trim to max size
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }
  }

  /**
   * Get previous entry (up arrow).
   * Returns null if at beginning of history.
   */
  previous(): string | null {
    if (this.history.length === 0) return null;

    if (this.index === -1) {
      // Start from end
      this.index = this.history.length - 1;
    } else if (this.index > 0) {
      this.index--;
    }

    return this.history[this.index];
  }

  /**
   * Get next entry (down arrow).
   * Returns null if at end of history (input should be cleared).
   */
  next(): string | null {
    if (this.index === -1) return null;

    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    } else {
      // Past end - return null to clear input
      this.index = -1;
      return null;
    }
  }

  /**
   * Get current entry at cursor position.
   */
  current(): string | null {
    if (this.index === -1 || this.index >= this.history.length) {
      return null;
    }
    return this.history[this.index];
  }

  /**
   * Reset cursor position (call after new input).
   */
  reset(): void {
    this.index = -1;
  }

  /**
   * Get all history entries.
   */
  getAll(): string[] {
    return [...this.history];
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.history = [];
    this.index = -1;
  }
}
