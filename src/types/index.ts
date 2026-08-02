/**
 * Tinkuy Types — Framework contracts
 *
 * These interfaces define how everything connects.
 * Users implement Tool. Framework implements Agent.
 * Router and Guard are pluggable (Styrr + Sayay by default).
 */

import type { ConversationStore } from '../conversation/index.js';
import type { OntologySchema } from '../ontology/types.js';
import type { ValidationResult } from '../ontology/types.js';

// ─── Tool System ────────────────────────────────────────────────────────

/** A tool that the agent can call */
export interface Tool {
  /** Unique tool name (e.g., "get_findings", "search_docs") */
  name: string;
  /** Human-readable description (sent to LLM) */
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
  /** Execute the tool. Receives parsed arguments, returns any result. */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Tool call parsed from LLM response */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of executing a tool */
export interface ToolResult {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
  durationMs: number;
}

// ─── Messages ───────────────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

// ─── Router Interface (Styrr-compatible) ────────────────────────────────

/** LLM Router — pluggable. Default: StyrRouter. */
export interface Router {
  call(messages: Message[], options?: RouterOptions): Promise<RouterResponse>;
  stream(messages: Message[], options?: RouterOptions): AsyncGenerator<RouterStreamEvent>;
}

export type RouterStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; toolCall: { id: string; name: string; arguments: any } }
  | { type: 'tool_call_done'; toolCall: { id: string; name: string; arguments: any } }
  | { type: 'done'; modelUsed: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }
  | { type: 'error'; error: string };

export interface RouterOptions {
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface RouterResponse {
  text: string;
  toolCalls?: ToolCall[];
  modelUsed: string;
  latencyMs: number;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

// ─── Guard Interface (Sayay-compatible) ──────────────────────────────────

/** Budget guard — pluggable. Default: SayayGuard. Optional. */
export interface Guard {
  check(userId: string, estimatedCost?: number): Promise<GuardDecision>;
  record(userId: string, cost: number): Promise<void>;
}

export interface GuardDecision {
  action: 'allow' | 'warn' | 'degrade' | 'block';
  reason?: string;
  remaining: number;
  suggestedModel?: string;
}

// ─── Agent Configuration ────────────────────────────────────────────────

export interface AgentConfig {
  /** LLM router (Styrr or custom) */
  router: Router;
  /** Budget guard (Sayay or custom). Optional. */
  guard?: Guard;
  /** User ID for budget tracking */
  userId?: string;
  /** Registered tools */
  tools: Tool[];
  /** System prompt (agent personality/instructions) */
  systemPrompt: string;
  /** Max iterations before forced stop (default: 10) */
  maxIterations?: number;
  /** Temperature (default: 0.7) */
  temperature?: number;
  /** Conversation store for multi-turn persistence */
  conversationStore?: ConversationStore;
  /**
   * Optional deterministic grounding (TokenOps ontology).
   * When provided, every model response is validated against the strict
   * T-Box schema before it is persisted or fed back to the loop.
   * Throws `OntologyViolationException` when `fail_on_unknown_relation` is set.
   */
  ontology?: OntologySchema;
  /** Hook: called after ontology validation, before persistence. */
  onOntologyValidated?: (event: { validation: ValidationResult }) => void;
  /** Hook: called when ontology validation fails (even without kill switch). */
  onOntologyViolation?: (event: { violations: import('../ontology/types.js').RelationViolation[] }) => void;
  /** Hook: called after each iteration */
  onIteration?: (event: IterationEvent) => void;
  /** Hook: called when a tool executes */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Hook: called when agent run completes */
  onComplete?: (event: CompleteEvent) => void;
}

// ─── Agent Stream ────────────────────────────────────────────────────────

export type AgentStreamEvent =
  | { type: 'iteration_start'; iteration: number; modelUsed?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_result'; tool: string; toolArgs: Record<string, unknown>; toolResult: unknown; toolError?: string; durationMs: number }
  | { type: 'done'; iterations: number; toolsUsed: string[]; totalLatencyMs: number; modelsUsed: string[] }
  | { type: 'error'; error: string }
  | { type: 'blocked'; blockReason?: string; iterations: number; toolsUsed: string[] };

export interface AgentStreamOptions {
  /** Session ID for conversation persistence */
  sessionId?: string;
}

// ─── Agent Result ───────────────────────────────────────────────────────

export interface AgentResult {
  /** Final text response */
  text: string;
  /** Was the agent blocked by budget guard? */
  blocked: boolean;
  /** Block reason (if blocked) */
  blockReason?: string;
  /** How many LLM calls were made */
  iterations: number;
  /** Which tools were called */
  toolsUsed: string[];
  /** All tool results (for inspection) */
  toolResults: ToolResult[];
  /** Total latency (all iterations combined) */
  totalLatencyMs: number;
  /** Which model(s) responded */
  modelsUsed: string[];
  /** Estimated total cost (if usage data available) */
  estimatedCostUsd?: number;
}

// ─── Events (for hooks/observability) ───────────────────────────────────

export interface IterationEvent {
  iteration: number;
  modelUsed: string;
  latencyMs: number;
  hasToolCalls: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCallEvent {
  iteration: number;
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  error?: string;
}

export interface CompleteEvent {
  session_id?: string;
  user_id?: string;
  iterations: number;
  totalLatencyMs: number;
  modelsUsed: string[];
  toolsUsed: string[];
  result: AgentResult;
}
