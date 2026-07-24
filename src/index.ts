/**
 * 🌊 Tinkuy — Minimal Provider-Agnostic AI Agent Framework
 *
 * "Where rivers meet" (Quechua: Tinkuy)
 *
 * Build AI agents with tool loops, budget control, and multi-model routing.
 * Zero opinions. Zero vendor lock-in. Under 200 lines of core logic.
 *
 * @example
 * import { Agent, defineTool } from 'tinkuy';
 * import { StyrRouter } from 'styrr';
 * import { SayayGuard, MemoryStorage } from 'sayay';
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

// Registry
export { ToolRegistry } from './registry/index.js';
export type { ToolRegistryEntry, RegistryValidationError } from './registry/index.js';

// State
export { MemoryState } from './state/index.js';
export type { ConversationState } from './state/index.js';

// Types (re-export all for consumers)
export type {
  AgentConfig,
  AgentResult,
  Guard,
  GuardDecision,
  IterationEvent,
  Message,
  MessageRole,
  Router,
  RouterOptions,
  RouterResponse,
  Tool,
  ToolCall,
  ToolCallEvent,
  ToolResult,
  ToolSchema,
} from './types/index.js';
