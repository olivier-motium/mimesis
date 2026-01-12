/**
 * Repository for conversation persistence.
 * Manages stateful conversations for Commander and future worker sessions.
 */

import { eq } from "drizzle-orm";
import { getFleetDb, schema } from "./index.js";
import type { Conversation, NewConversation } from "./schema.js";
import { MODEL, COMMANDER_CWD } from "../config/fleet.js";
import { randomUUID } from "node:crypto";

/** Conversation kinds */
export const CONVERSATION_KIND = {
  COMMANDER: "commander",
  WORKER_SESSION: "worker_session",
} as const;

export type ConversationKind =
  (typeof CONVERSATION_KIND)[keyof typeof CONVERSATION_KIND];

/**
 * Repository for managing conversations in the Fleet database.
 */
export class ConversationRepo {
  /**
   * Get a conversation by ID.
   */
  get(conversationId: string): Conversation | undefined {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.conversationId, conversationId))
      .get();
  }

  /**
   * Get conversations by kind.
   */
  getByKind(kind: ConversationKind): Conversation[] {
    const db = getFleetDb();
    return db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.kind, kind))
      .all();
  }

  /**
   * Get or create the singleton Commander conversation.
   * Only one Commander conversation exists at a time.
   */
  getOrCreateCommander(): Conversation {
    const existing = this.getByKind(CONVERSATION_KIND.COMMANDER);
    if (existing.length > 0) {
      return existing[0];
    }

    // Create new Commander conversation
    const conversationId = randomUUID();
    const now = new Date().toISOString();

    const db = getFleetDb();
    db.insert(schema.conversations)
      .values({
        conversationId,
        kind: CONVERSATION_KIND.COMMANDER,
        cwd: COMMANDER_CWD,
        model: MODEL.OPUS,
        lastOutboxEventIdSeen: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.get(conversationId)!;
  }

  /**
   * Create a new conversation.
   * Returns the created conversation.
   */
  create(params: {
    kind: ConversationKind;
    cwd: string;
    model: string;
  }): Conversation {
    const db = getFleetDb();
    const conversationId = randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.conversations)
      .values({
        conversationId,
        kind: params.kind,
        cwd: params.cwd,
        model: params.model,
        lastOutboxEventIdSeen: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.get(conversationId)!;
  }

  /**
   * Update the Claude session ID for a conversation.
   * Called after the first turn completes to capture the session ID from Claude.
   */
  updateClaudeSessionId(conversationId: string, claudeSessionId: string): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.conversations)
      .set({
        claudeSessionId,
        updatedAt: now,
      })
      .where(eq(schema.conversations.conversationId, conversationId))
      .run();
  }

  /**
   * Update the last seen outbox event ID.
   * Used for fleet prelude cursor tracking.
   */
  updateLastOutboxEventSeen(conversationId: string, eventId: number): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.conversations)
      .set({
        lastOutboxEventIdSeen: eventId,
        updatedAt: now,
      })
      .where(eq(schema.conversations.conversationId, conversationId))
      .run();
  }

  /**
   * Clear the Claude session ID to start a fresh conversation.
   * Used when user requests a new Commander conversation.
   */
  clearClaudeSessionId(conversationId: string): void {
    const db = getFleetDb();
    const now = new Date().toISOString();

    db.update(schema.conversations)
      .set({
        claudeSessionId: null,
        updatedAt: now,
      })
      .where(eq(schema.conversations.conversationId, conversationId))
      .run();
  }

  /**
   * Delete a conversation.
   */
  delete(conversationId: string): void {
    const db = getFleetDb();
    db.delete(schema.conversations)
      .where(eq(schema.conversations.conversationId, conversationId))
      .run();
  }

  /**
   * Reset the Commander conversation to start fresh.
   * Clears the Claude session ID but keeps the conversation record.
   */
  resetCommander(): Conversation {
    const commander = this.getOrCreateCommander();
    this.clearClaudeSessionId(commander.conversationId);
    return this.get(commander.conversationId)!;
  }
}
