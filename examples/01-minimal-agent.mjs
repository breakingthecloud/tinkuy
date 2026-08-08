/**
 * 01 — Minimal Agent
 *
 * The smallest Tinkuy agent: a mock router that always returns text.
 * Shows `AgentResult` fields: text, iterations, toolsUsed, totalLatencyMs, modelsUsed.
 *
 * Run: node examples/01-minimal-agent.mjs
 */

import { Agent } from '@carloscortezcloud/tinkuy-agent';

// A router just needs `call` (and optionally `stream`).
// Swap this mock for new StyrRouter({...}) to use real models.
const mockRouter = {
  async call() {
    return {
      text: 'Hello from the mock model!',
      modelUsed: 'mock-1',
      latencyMs: 120,
      usage: { promptTokens: 50, completionTokens: 20 },
    };
  },
  async *stream() {
    yield { type: 'text_delta', text: 'Hello from the mock model!' };
    yield { type: 'done', modelUsed: 'mock-1' };
  },
};

const agent = new Agent({
  router: mockRouter,
  tools: [],
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('Say hello');

console.log('text:', result.text);
console.log('iterations:', result.iterations);
console.log('toolsUsed:', result.toolsUsed);
console.log('totalLatencyMs:', result.totalLatencyMs);
console.log('modelsUsed:', result.modelsUsed);
console.log('blocked:', result.blocked);
