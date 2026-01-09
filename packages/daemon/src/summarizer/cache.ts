/**
 * Cache utilities for summarization.
 */

import type { LogEntry } from "../types.js";

// Cache entry with timestamp for TTL-based eviction
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export interface SummaryCacheEntry {
  summary: string;
  hash: string;
  timestamp: number;
}

export interface GoalCacheEntry {
  goal: string;
  entryCount: number;
  timestamp: number;
}

/**
 * Generic LRU cache with TTL support and duplicate request prevention.
 */
export class SummarizerCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private pending = new Map<string, Promise<T>>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number
  ) {}

  /**
   * Get a value from cache, computing it if not present or stale.
   * Prevents duplicate concurrent requests for the same key.
   */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      // Update timestamp on access (LRU behavior)
      cached.timestamp = Date.now();
      return cached.value;
    }

    // Check if a request is already pending for this key
    const pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    // Compute with duplicate request prevention
    const promise = compute();
    this.pending.set(key, promise);

    try {
      const value = await promise;
      this.set(key, value);
      return value;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Get a value from cache without computing.
   */
  get(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      // Update timestamp on access (LRU behavior)
      cached.timestamp = Date.now();
      return cached.value;
    }
    return undefined;
  }

  /**
   * Set a value in the cache.
   */
  set(key: string, value: T): void {
    this.evictIfNeeded();
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Check if a key exists in cache and is not stale.
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    return cached !== undefined && Date.now() - cached.timestamp < this.ttlMs;
  }

  /**
   * Delete a specific key from cache.
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all entries from cache.
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * Evict stale and oldest entries if cache is full.
   */
  private evictIfNeeded(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }

    // Enforce max size - remove oldest entries
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = this.cache.size - this.maxSize + 1;
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }
}

/**
 * Evict stale entries from a cache based on TTL and max size.
 * Uses LRU-style eviction when size limit is exceeded.
 * @deprecated Use SummarizerCache class instead
 */
export function evictStaleEntries<K, V extends { timestamp: number }>(
  cache: Map<K, V>,
  ttlMs: number,
  maxSize: number
): void {
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > ttlMs) {
      cache.delete(key);
    }
  }

  // Enforce max size - remove oldest entries
  if (cache.size > maxSize) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = cache.size - maxSize;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

/**
 * Generate a content hash for cache invalidation
 */
export function generateContentHash(entries: LogEntry[]): string {
  // Use last few entries to determine if content changed significantly
  const recent = entries.slice(-5);
  return recent.map((e) => {
    if ("timestamp" in e) {
      return `${e.type}:${e.timestamp}`;
    }
    return e.type;
  }).join("|");
}
