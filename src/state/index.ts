/**
 * State management — conversation memory.
 * v0.1: MemoryState (in-memory, lost on restart).
 * Future: KVState (CF KV), D1State (SQLite), RedisState.
 */

import type { Message } from '../types/index.js';

export interface ConversationState {
  getMessages(sessionId: string): Promise<Message[]>;
  saveMessages(sessionId: string, messages: Message[]): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

/** In-memory conversation state (for single-request agents or testing) */
export class MemoryState implements ConversationState {
  private store = new Map<string, Message[]>();

  async getMessages(sessionId: string): Promise<Message[]> {
    return this.store.get(sessionId) || [];
  }

  async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    this.store.set(sessionId, messages);
  }

  async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}
