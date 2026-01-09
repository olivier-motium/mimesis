/**
 * Repository for terminal link persistence.
 * Manages session -> kitty window mappings in SQLite.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "./index.js";
import type { KittyRc } from "../kitty-rc.js";
import { logSilentError } from "../utils/logger.js";

export interface TerminalLink {
  sessionId: string;
  kittyWindowId: number;
  linkedAt: string;
  stale: boolean;
  repoPath?: string;
  createdVia?: string;
}

/**
 * Repository for managing terminal links in the database.
 */
export class TerminalLinkRepo {
  /**
   * Get a terminal link by session ID.
   */
  get(sessionId: string): TerminalLink | undefined {
    const db = getDb();
    const result = db
      .select()
      .from(schema.terminalLinks)
      .where(eq(schema.terminalLinks.sessionId, sessionId))
      .get();
    return result ? this.toTerminalLink(result) : undefined;
  }

  /**
   * Get all terminal links.
   */
  getAll(): TerminalLink[] {
    const db = getDb();
    return db
      .select()
      .from(schema.terminalLinks)
      .all()
      .map((row) => this.toTerminalLink(row));
  }

  /**
   * Insert or update a terminal link.
   */
  upsert(link: TerminalLink): void {
    const db = getDb();
    db.insert(schema.terminalLinks)
      .values({
        sessionId: link.sessionId,
        kittyWindowId: link.kittyWindowId,
        linkedAt: link.linkedAt,
        stale: link.stale,
        repoPath: link.repoPath,
        createdVia: link.createdVia,
      })
      .onConflictDoUpdate({
        target: schema.terminalLinks.sessionId,
        set: {
          kittyWindowId: link.kittyWindowId,
          linkedAt: link.linkedAt,
          stale: link.stale,
          repoPath: link.repoPath,
          createdVia: link.createdVia,
        },
      })
      .run();
  }

  /**
   * Delete a terminal link by session ID.
   */
  delete(sessionId: string): void {
    const db = getDb();
    db.delete(schema.terminalLinks)
      .where(eq(schema.terminalLinks.sessionId, sessionId))
      .run();
  }

  /**
   * Mark a terminal link as stale.
   */
  markStale(sessionId: string): void {
    const db = getDb();
    db.update(schema.terminalLinks)
      .set({ stale: true })
      .where(eq(schema.terminalLinks.sessionId, sessionId))
      .run();
  }

  /**
   * Mark a terminal link as not stale (refresh).
   */
  markFresh(sessionId: string): void {
    const db = getDb();
    db.update(schema.terminalLinks)
      .set({ stale: false })
      .where(eq(schema.terminalLinks.sessionId, sessionId))
      .run();
  }

  /**
   * Update the window ID for a recovered link.
   * Called when we find the window via user_vars or cmdline after ID changed.
   */
  updateWindowId(sessionId: string, newWindowId: number): void {
    const db = getDb();
    db.update(schema.terminalLinks)
      .set({
        kittyWindowId: newWindowId,
        stale: false,
        linkedAt: new Date().toISOString(),
      })
      .where(eq(schema.terminalLinks.sessionId, sessionId))
      .run();
  }

  /**
   * Validate all links against current kitty windows.
   * Returns the session IDs that were marked as stale.
   */
  async validateAll(kittyRc: KittyRc): Promise<string[]> {
    const staleSessionIds: string[] = [];

    try {
      const osWindows = await kittyRc.ls();
      const links = this.getAll();

      for (const link of links) {
        if (!link.stale && !kittyRc.windowExists(osWindows, link.kittyWindowId)) {
          this.markStale(link.sessionId);
          staleSessionIds.push(link.sessionId);
        }
      }
    } catch (error) {
      // Kitty not available - log for debugging and mark all non-stale as stale
      logSilentError("validateAll: kitty ls failed", error);
      const links = this.getAll().filter((l) => !l.stale);
      for (const link of links) {
        this.markStale(link.sessionId);
        staleSessionIds.push(link.sessionId);
      }
    }

    return staleSessionIds;
  }

  /**
   * Convert database row to TerminalLink interface.
   */
  private toTerminalLink(
    row: typeof schema.terminalLinks.$inferSelect
  ): TerminalLink {
    return {
      sessionId: row.sessionId,
      kittyWindowId: row.kittyWindowId,
      linkedAt: row.linkedAt,
      stale: row.stale,
      repoPath: row.repoPath ?? undefined,
      createdVia: row.createdVia ?? undefined,
    };
  }
}
