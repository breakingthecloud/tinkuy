/**
 * Tinkuy Conversation Store — Persist conversation history across runs
 *
 * Enables multi-turn conversations:
 *   const store = new MemoryConversationStore();
 *   const agent = new Agent({ ..., conversationStore: store });
 *   await agent.run('Hello', { sessionId: 'user-123' }); // remembers context
 *   await agent.run('Follow up', { sessionId: 'user-123' }); // has prior context
 */

import type { Message } from '../types/index.js';

// ─── Interface ──────────────────────────────────────────────────────────

export interface ConversationStore {
  /** Get conversation history for a session */
  get(sessionId: string): Promise<Message[]>;
  /** Save messages to a session (append or replace) */
  save(sessionId: string, messages: Message[]): Promise<void>;
  /** Clear a session's history */
  clear(sessionId: string): Promise<void>;
  /** List active session IDs (optional, for admin) */
  list?(): Promise<string[]>;
}

export interface ConversationOptions {
  /** Max messages to keep in history (sliding window). Default: 50 */
  maxMessages?: number;
  /** Max age in ms before auto-clearing. Default: 1 hour */
  maxAgeMs?: number;
}

// ─── Memory Store (in-process, for testing/local) ───────────────────────

export class MemoryConversationStore implements ConversationStore {
  private sessions: Map<string, { messages: Message[]; updatedAt: number }> = new Map();
  private maxMessages: number;
  private maxAgeMs: number;

  constructor(options: ConversationOptions = {}) {
    this.maxMessages = options.maxMessages ?? 50;
    this.maxAgeMs = options.maxAgeMs ?? 60 * 60 * 1000; // 1 hour
  }

  async get(sessionId: string): Promise<Message[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    // Check expiry
    if (Date.now() - session.updatedAt > this.maxAgeMs) {
      this.sessions.delete(sessionId);
      return [];
    }

    return session.messages;
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    // Keep only last N messages (sliding window)
    const trimmed = messages.slice(-this.maxMessages);
    this.sessions.set(sessionId, { messages: trimmed, updatedAt: Date.now() });
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  /** Get count of active sessions */
  get size(): number {
    return this.sessions.size;
  }
}

// ─── KV Store (Cloudflare Workers KV) ───────────────────────────────────

/**
 * KV-backed conversation store for Cloudflare Workers.
 * Pass the KV namespace binding.
 *
 * Usage in CF Worker:
 *   const store = new KVConversationStore(env.CONVERSATIONS);
 */
export class KVConversationStore implements ConversationStore {
  private kv: any; // KVNamespace
  private prefix: string;
  private maxMessages: number;
  private ttlSeconds: number;

  constructor(kv: any, options: { prefix?: string; maxMessages?: number; ttlSeconds?: number } = {}) {
    this.kv = kv;
    this.prefix = options.prefix ?? 'conv:';
    this.maxMessages = options.maxMessages ?? 50;
    this.ttlSeconds = options.ttlSeconds ?? 3600; // 1 hour default
  }

  async get(sessionId: string): Promise<Message[]> {
    const data = await this.kv.get(`${this.prefix}${sessionId}`, 'json');
    if (!data) return [];
    return (data as Message[]).slice(-this.maxMessages);
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    const trimmed = messages.slice(-this.maxMessages);
    await this.kv.put(`${this.prefix}${sessionId}`, JSON.stringify(trimmed), {
      expirationTtl: this.ttlSeconds,
    });
  }

  async clear(sessionId: string): Promise<void> {
    await this.kv.delete(`${this.prefix}${sessionId}`);
  }
}
