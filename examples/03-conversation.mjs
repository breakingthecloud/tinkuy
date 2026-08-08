/**
 * 03 — Conversation State (multi-turn)
 *
 * Persist conversation history across separate runs so the agent "remembers"
 * the prior exchange. Uses MemoryConversationStore (in-process).
 * Swap for KVConversationStore in a Cloudflare Worker to persist in KV.
 *
 * NOTE: the conversation store saves on the STREAMING path (Agent.stream()),
 * so we consume the stream to completion (same as a real chat UI would).
 *
 * Run: node examples/03-conversation.mjs
 */

import { Agent } from '@carloscortezcloud/tinkuy-agent';
import { MemoryConversationStore } from '@carloscortezcloud/tinkuy-agent/conversation';

const mockRouter = {
  async call() {
    throw new Error('use stream');
  },
  async *stream() {
    yield { type: 'text_delta', text: 'Mock reply — swap me for a real router.' };
    yield { type: 'done', modelUsed: 'mock-1' };
  },
};

async function runTurn(agent, message, sessionId) {
  for await (const event of agent.stream(message, { sessionId })) {
    if (event.type === 'text_delta') process.stdout.write(event.text);
    if (event.type === 'tool_call_result') console.log(`\n[tool] ${event.tool}`);
    if (event.type === 'done') console.log('\n[done]', event.iterations, 'iteration(s)');
  }
}

const store = new MemoryConversationStore({ maxMessages: 20, maxAgeMs: 60 * 60 * 1000 });

const agent = new Agent({
  router: mockRouter,
  tools: [],
  systemPrompt: 'You are a helpful assistant.',
  conversationStore: store,
});

// Same sessionId → history flows between calls.
await runTurn(agent, 'My name is Carlos', 'user-42');
await runTurn(agent, 'What is my name?', 'user-42');

console.log('\nStored messages for user-42:', (await store.get('user-42')).length);
console.log('Store size:', store.size);

// Different sessionId → fresh context.
await runTurn(agent, 'Who are you?', 'other-user');
console.log('Store size after 2 sessions:', store.size);

await store.clear('user-42');
console.log('Size after clear:', store.size);