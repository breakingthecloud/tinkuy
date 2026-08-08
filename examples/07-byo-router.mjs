/**
 * 07 — Bring Your Own Router (no Styrr / no Sayay required)
 *
 * Tinkuy is provider-agnostic: implement the 2-method `Router` interface and
 * it uses YOUR endpoint. This example talks to any OpenAI-compatible API with
 * plain fetch + streaming SSE parsing — zero framework dependencies beyond
 * tinkuy itself.
 *
 * Run: node examples/07-byo-router.mjs   (no env needed; mock fallback)
 */

import { Agent } from '@carloscortezcloud/tinkuy-agent';

/**
 * A minimal OpenAI-compatible router using fetch. Works with OpenAI,
 * OpenRouter, Ollama, NVIDIA, etc. Swap the mock for a real endpoint by
 * setting OPENAI_BASE_URL / OPENAI_API_KEY.
 */
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.OPENAI_API_KEY; // undefined → mock fallback below

const myRouter = {
  async call(messages, options) {
    if (!API_KEY) {
      // Mock fallback so the example runs without credentials.
      const last = messages[messages.length - 1];
      return {
        text: `[mock] respondería a: "${last.content}"`,
        modelUsed: 'mock-1',
        latencyMs: 80,
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        tools: options?.tools,
        temperature: options?.temperature ?? 0.7,
      }),
    });
    const json = await res.json();
    const choice = json.choices?.[0];

    // Normalize tool_calls and text into Tinkuy's RouterResponse shape.
    return {
      text: choice?.message?.content ?? '',
      toolCalls: (choice?.message?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      })),
      modelUsed: json.model,
      latencyMs: Math.round(performance.now()),
      usage: { promptTokens: json.usage?.prompt_tokens, completionTokens: json.usage?.completion_tokens },
    };
  },

  async *stream(messages, options) {
    // Minimal stub — 99% of agents call `call()` for one-shot answers.
    const res = await this.call(messages, options);
    yield { type: 'text_delta', text: res.text };
    yield { type: 'done', modelUsed: res.modelUsed };
  },
};

const agent = new Agent({
  router: myRouter,
  tools: [],
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('Hola, dime algo corto');
console.log('result.text:', result.text);
console.log('modelUsed:', result.modelsUsed?.[0] || 'mock');
console.log('iterations:', result.iterations);