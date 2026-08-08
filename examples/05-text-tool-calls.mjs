/**
 * 05 — Text-embedded tool calls (free models, v0.7.0)
 *
 * Problem: free models (e.g. OpenRouter `:free` endpoints) sometimes DON'T emit
 * structured `tool_calls`. Instead they write a JSON blob directly into the
 * response text:
 *
 *   {"tool":"get_weather","arguments":{"city":"Lima"}}
 *
 * Before v0.7.0 the agent would return that raw JSON as the final answer.
 * Now `extractTextToolCall` detects it, executes the tool, and continues the
 * loop — as if the tool call had arrived structurally.
 *
 * This guide shows the raw util AND an end-to-end agent that auto-handles it.
 *
 * Run: node examples/05-text-tool-calls.mjs
 */

import { Agent, defineTool, extractTextToolCall } from '@carloscortezcloud/tinkuy-agent';

// ── The utility in isolation ─────────────────────────────────────────────
console.log('extractTextToolCall examples:');

const cases = [
  '{"tool":"get_sprint_status","arguments":{}}',
  '{"name":"explain_phase","arguments":{"phase":"BUILD"}}',
  '```json\n{"name":"search","arguments":{"q":"tinkuy"}}\n```',
  'Voy a consultar el sprint status...', // narrative → null
];
for (const text of cases) {
  console.log(`  ${JSON.stringify(text).padEnd(78)} →`, JSON.stringify(extractTextToolCall(text)));
}

// ── Automatic handling end-to-end ────────────────────────────────────────
const getWeather = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  execute: async ({ city }) => ({ temp: 22, condition: 'sunny', city }),
});

// Mock router that "forgets" to emit structured tool_calls — it writes the
// JSON into text instead. The agent must detect + execute + continue the loop.
const phases = [
  { text: '{"tool":"get_weather","arguments":{"city":"Lima"}}' },
  { text: 'It is 22°C and sunny in Lima.' },
];
let phaseIdx = 0;

const router = {
  async call() {
    const phase = phases[phaseIdx] || { text: 'Done.' };
    phaseIdx++;
    return {
      text: phase.text,
      modelUsed: 'mock-free-model',
      latencyMs: 50,
    };
  },
  async *stream() {
    // Not used by run(); implemented for Router interface parity.
  },
};

const agent = new Agent({
  router,
  tools: [getWeather],
  systemPrompt: 'You are a helpful assistant.',
  maxIterations: 3,
  onToolCall: (event) => console.log(`  [onToolCall] ${event.tool}(${JSON.stringify(event.arguments)}) → ${event.durationMs}ms`),
});

const result = await agent.run('What is the weather in Lima?');

console.log('\nFinal answer:', result.text);
console.log('iterations:', result.iterations);
console.log('toolsUsed:', result.toolsUsed);
console.log(
  'Raw JSON exposed as final answer?',
  result.text.startsWith('{"'),
);