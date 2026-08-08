/**
 * 02 — Tool Loop
 *
 * Tools with arguments + a multi-iteration loop:
 *   iteration 1 → model emits tool_call(get_weather, {city})
 *   iteration 2 → model receives tool result and answers in text.
 *
 * Also shows tool error recovery: a failing tool feeds `Error: ...` back to the
 * model so it can retry or apologize — the loop never crashes.
 *
 * Run: node examples/02-tool-loop.mjs
 */

import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';

const getWeather = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  },
  execute: async ({ city }) => ({ temp: 22, condition: 'sunny', city }),
});

// This tool always fails — shows error recovery.
const unreliable = defineTool({
  name: 'unreliable_tool',
  description: 'A tool that sometimes fails',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    throw new Error('rate limit exceeded');
  },
});

// Mock router that simulates the LLM: emits structured tool_calls across
// iterations, then a final text answer. `run()` uses `call()`.
const phases = [
  // iteration 1: emit a tool call → get_weather
  {
    text: '{"tool":"get_weather","arguments":{"city":"Lima"}}',
    toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'Lima' } }],
  },
  // iteration 2: emit the failing tool call
  { text: '', toolCalls: [{ id: 'call_2', name: 'unreliable_tool', arguments: {} }] },
  // iteration 3: final text answer
  { text: 'It is 22°C and sunny in Lima.' },
];
let phaseIdx = 0;

const router = {
  async call() {
    const phase = phases[phaseIdx] || { text: 'Done.' };
    phaseIdx++;
    return {
      text: phase.text ?? '',
      toolCalls: phase.toolCalls,
      modelUsed: 'mock-1',
      latencyMs: 50,
    };
  },
  async *stream() {
    // Not used by run(); implemented for Router interface parity.
  },
};

const agent = new Agent({
  router,
  tools: [getWeather, unreliable],
  systemPrompt: 'You are a helpful assistant. Use tools when needed.',
  onToolCall: (event) => {
    console.log(`  [onToolCall] ${event.tool} → ${event.durationMs}ms${event.error ? ` (${event.error})` : ''}`);
  },
});

const result = await agent.run('What is the weather in Lima?');

console.log('\nFinal:', result.text);
console.log('iterations:', result.iterations);
console.log('toolsUsed:', result.toolsUsed);
console.log('toolResults:', result.toolResults.map((r) => `${r.name}${r.error ? ` (error: ${r.error})` : ''}`));
