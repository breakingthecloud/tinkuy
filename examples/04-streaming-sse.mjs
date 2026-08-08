/**
 * 04 — Streaming + SSE (Cloudflare Worker)
 *
 * `Agent.stream()` yields AG-UI events in real time; `agentToSSE()` wraps the
 * async iterable into a `ReadableStream` you can return directly from a CF Worker.
 *
 * Run: node examples/04-streaming-sse.mjs
 */

import { Agent, agentToSSE } from '@carloscortezcloud/tinkuy-agent';

const mockRouter = {
  async call() {
    throw new Error('use stream');
  },
  async *stream() {
    yield { type: 'text_delta', text: 'The ' };
    yield { type: 'text_delta', text: 'weather ' };
    yield { type: 'text_delta', text: 'is sunny.' };
    yield { type: 'done', modelUsed: 'mock-1' };
  },
};

const agent = new Agent({
  router: mockRouter,
  tools: [],
  systemPrompt: 'You are a helpful assistant.',
});

const stream = agent.stream('What is the weather?');

console.log('Raw events:');
for await (const event of stream) {
  console.log(' ', JSON.stringify(event));
}

// ── CF Worker usage ──────────────────────────────────────────────────────
// export default {
//   async fetch(request, env) {
//     const agent = new Agent({ router: buildRouter(env), tools, systemPrompt });
//     return new Response(agentToSSE(agent.stream('Hello')), {
//       headers: {
//         'Content-Type': 'text/event-stream',
//         'Cache-Control': 'no-cache',
//       },
//     });
//   },
// };

// Demonstrate the SSE bytes:
const sseStream = agentToSSE(agent.stream('Hello'));
const reader = sseStream.getReader();
const decoder = new TextDecoder();
let sse = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  sse += decoder.decode(value);
}
console.log('\nSSE wire format:');
console.log(sse);