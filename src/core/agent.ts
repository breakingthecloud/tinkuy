/**
 * Tinkuy Agent — Core Tool Loop Engine
 *
 * The agent loop:
 *   1. Call LLM with messages + tool schemas
 *   2. If LLM returns tool_calls → execute tools → feed results back → goto 1
 *   3. If LLM returns text (no tool_calls) → done, return final answer
 *   4. If guard blocks → stop, return block reason
 *   5. If max iterations → stop, return last response
 *
 * Minimal. Predictable. Observable.
 */

import type {
  AgentConfig,
  AgentResult,
  Guard,
  Message,
  Router,
  Tool,
  ToolCall,
  ToolResult,
  ToolSchema,
} from '../types/index.js';

export class Agent {
  private router: Router;
  private guard?: Guard;
  private tools: Map<string, Tool>;
  private systemPrompt: string;
  private maxIterations: number;
  private temperature: number;
  private userId: string;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.router = config.router;
    this.guard = config.guard;
    this.tools = new Map(config.tools.map(t => [t.name, t]));
    this.systemPrompt = config.systemPrompt;
    this.maxIterations = config.maxIterations ?? 10;
    this.temperature = config.temperature ?? 0.7;
    this.userId = config.userId ?? 'default';
  }

  /**
   * Run the agent with a user message.
   * Returns when: final answer reached, budget blocked, or max iterations hit.
   */
  async run(userMessage: string): Promise<AgentResult> {
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const toolSchemas = this.buildToolSchemas();
    const toolsUsed: string[] = [];
    const toolResults: ToolResult[] = [];
    const modelsUsed: string[] = [];
    let totalLatencyMs = 0;
    let iterations = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      iterations = i + 1;

      // ── Budget check (if guard configured) ──
      if (this.guard) {
        const decision = await this.guard.check(this.userId, 0.005); // estimate
        if (decision.action === 'block') {
          return this.result({ text: '', blocked: true, blockReason: decision.reason, iterations, toolsUsed, toolResults, totalLatencyMs, modelsUsed });
        }
      }

      // ── Call LLM via router ──
      const response = await this.router.call(messages, {
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        temperature: this.temperature,
      });

      totalLatencyMs += response.latencyMs;
      if (!modelsUsed.includes(response.modelUsed)) {
        modelsUsed.push(response.modelUsed);
      }

      // ── Record cost (if guard configured) ──
      if (this.guard && response.usage?.completionTokens) {
        const estimatedCost = (response.usage.promptTokens ?? 0 + response.usage.completionTokens) * 0.000001;
        await this.guard.record(this.userId, estimatedCost);
      }

      // ── Emit iteration event ──
      if (this.config.onIteration) {
        this.config.onIteration({
          iteration: iterations,
          modelUsed: response.modelUsed,
          latencyMs: response.latencyMs,
          hasToolCalls: !!response.toolCalls?.length,
          toolCalls: response.toolCalls,
        });
      }

      // ── No tool calls? Final answer. ──
      if (!response.toolCalls?.length) {
        // Add assistant message
        messages.push({ role: 'assistant', content: response.text });
        return this.result({ text: response.text, blocked: false, iterations, toolsUsed, toolResults, totalLatencyMs, modelsUsed });
      }

      // ── Execute tool calls ──
      messages.push({ role: 'assistant', content: '', toolCalls: response.toolCalls });

      for (const call of response.toolCalls) {
        const toolResult = await this.executeTool(call, iterations);
        toolResults.push(toolResult);

        if (!toolsUsed.includes(call.name)) {
          toolsUsed.push(call.name);
        }

        // Feed tool result back to conversation
        messages.push({
          role: 'tool',
          content: toolResult.error
            ? `Error: ${toolResult.error}`
            : JSON.stringify(toolResult.result),
          toolCallId: call.id,
        });
      }

      // Loop continues → LLM gets tool results and decides next step
    }

    // Max iterations reached
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    return this.result({
      text: lastAssistant?.content || '[Max iterations reached]',
      blocked: false,
      iterations,
      toolsUsed,
      toolResults,
      totalLatencyMs,
      modelsUsed,
    });
  }

  // ─── Private ────────────────────────────────────────────────────────

  private async executeTool(call: ToolCall, iteration: number): Promise<ToolResult> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      return { callId: call.id, name: call.name, result: null, error: `Unknown tool: ${call.name}`, durationMs: 0 };
    }

    const start = Date.now();
    try {
      const result = await tool.execute(call.arguments);
      const durationMs = Date.now() - start;

      if (this.config.onToolCall) {
        this.config.onToolCall({ iteration, tool: call.name, arguments: call.arguments, result, durationMs });
      }

      return { callId: call.id, name: call.name, result, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);

      if (this.config.onToolCall) {
        this.config.onToolCall({ iteration, tool: call.name, arguments: call.arguments, result: null, durationMs, error });
      }

      return { callId: call.id, name: call.name, result: null, error, durationMs };
    }
  }

  private buildToolSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private result(partial: Omit<AgentResult, 'estimatedCostUsd'>): AgentResult {
    return { ...partial, estimatedCostUsd: undefined };
  }
}
