/**
 * 🌊 Tinkuy — Minimal Provider-Agnostic AI Agent Framework
 *
 * "Where rivers meet" (Quechua: Tinkuy)
 *
 * Build AI agents with tool loops, budget control, and multi-model routing.
 * Zero opinions. Zero vendor lock-in. Under 200 lines of core logic.
 *
 * @example
 * import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
 * import { StyrRouter } from '@carloscortezcloud/styrr-llm';
 * import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';
 *
 * const agent = new Agent({
 *   router: new StyrRouter({ apiKey: '...', models: [...] }),
 *   guard: new SayayGuard({ storage: new MemoryStorage(), budget: { dailyUsd: 5 } }),
 *   tools: [myTool1, myTool2],
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 *
 * const result = await agent.run('What are my AWS costs?');
 */

// Core
export { Agent } from './core/agent.js';

// Tools
export { defineTool, simpleTask } from './tools/index.js';

// Text-embedded tool call extraction
export { extractTextToolCall } from './core/text-tool.js';
export type { ExtractedTextTool } from './core/text-tool.js';

// Registry
export { ToolRegistry } from './registry/index.js';
export type { ToolRegistryEntry, RegistryValidationError } from './registry/index.js';

// Conversation
export { MemoryConversationStore, KVConversationStore } from './conversation/index.js';
export type { ConversationStore, ConversationOptions } from './conversation/index.js';

// State
export { MemoryState } from './state/index.js';
export type { ConversationState } from './state/index.js';

// SSE helpers
export { agentToSSE } from './sse.js';

// Types (re-export all for consumers)
export type {
  AgentConfig,
  AgentResult,
  AgentStreamEvent,
  AgentStreamOptions,
  CompleteEvent,
  Guard,
  GuardDecision,
  IterationEvent,
  Message,
  MessageRole,
  Router,
  RouterOptions,
  RouterResponse,
  RouterStreamEvent,
  Tool,
  ToolCall,
  ToolCallEvent,
  ToolResult,
  ToolSchema,
} from './types/index.js';
