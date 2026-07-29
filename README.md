# 🌊 Tinkuy — Minimal Provider-Agnostic AI Agent Framework

Where rivers meet. Build AI agents with tool loops, budget control, and multi-model routing. Zero opinions. Zero vendor lock-in. Under 200 lines of core logic.

## Install

```bash
npm install @carloscortezcloud/tinkuy-agent
```

## Quick Start

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

// Define tools
const getWeather = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  execute: async ({ city }) => ({ temp: 22, condition: 'sunny', city }),
});

// Create agent
const agent = new Agent({
  router: new StyrRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    models: [{ id: 'meta-llama/llama-3.3-70b-instruct:free' }],
  }),
  guard: new SayayGuard({
    storage: new MemoryStorage(),
    budget: { dailyUsd: 5.0 },
  }),
  tools: [getWeather],
  systemPrompt: 'You are a helpful assistant. Use tools when needed.',
});

// Run
const result = await agent.run('What is the weather in Lima?');
console.log(result.text);           // "The weather in Lima is 22°C and sunny."
console.log(result.iterations);     // 2 (1: tool call, 2: final answer)
console.log(result.toolsUsed);      // ['get_weather']
console.log(result.totalLatencyMs); // ~3500
```

## How It Works

```
User: "What's the weather?"
  │
  ▼ iteration 1
Agent → LLM: "Here are my tools: [get_weather]. User asks about weather."
LLM → Agent: tool_call { name: "get_weather", args: { city: "Lima" } }
Agent → Tool: execute get_weather({ city: "Lima" })
Tool → Agent: { temp: 22, condition: "sunny" }
  │
  ▼ iteration 2
Agent → LLM: "Tool returned: {temp: 22, sunny}. Answer the user."
LLM → Agent: "The weather in Lima is 22°C and sunny."
  │
  ▼ done
Agent → User: result
```

## Features

- **Tool loop**: call LLM → parse tool_calls → execute → feed back → repeat
- **Budget guard**: Sayay integration (block/degrade/warn before each call)
- **Multi-model**: Styrr integration (fallback chain, cheapest, fastest)
- **Streaming**: `Agent.stream()` yields AG-UI events (text_delta, tool_call_result, done, blocked)
- **SSE helper**: `agentToSSE()` converts the stream to a Cloudflare Worker `Response`
- **Observable**: `onIteration` + `onToolCall` + `onComplete` hooks (feed to Qhaway)
- **Conversation state**: `MemoryConversationStore` / `KVConversationStore` with sliding windows
- **Max iterations**: prevent infinite loops (default 10)
- **Error resilient**: tool errors are fed back to LLM as context (it recovers)
- **Zero deps**: only peer deps on Styrr + Sayay (both optional)
- **Tiny**: ~200 lines core logic, ~5KB bundled

## Architecture

```
┌─────────────────────────────────────┐
│ Tinkuy Agent                        │
│                                     │
│  ┌─────────┐  ┌───────┐  ┌──────┐  │
│  │ Router  │  │ Guard │  │Tools │  │
│  │ (Styrr) │  │(Sayay)│  │(yours)│  │
│  └────┬────┘  └───┬───┘  └──┬───┘  │
│       │            │         │      │
│       ▼            ▼         ▼      │
│  ┌──────────────────────────────┐   │
│  │     Agent Loop (core)        │   │
│  │  for each iteration:         │   │
│  │    guard.check() → allow?    │   │
│  │    router.call() → response  │   │
│  │    guard.record() → track    │   │
│  │    if tool_calls → execute   │   │
│  │    if text → return          │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Streaming

```typescript
import { Agent, defineTool, agentToSSE } from '@carloscortezcloud/tinkuy-agent';

const agent = new Agent({ router, tools, systemPrompt: '...' });

// In a Cloudflare Worker:
app.post('/chat/stream', async (c) => {
  const { message, sessionId } = await c.req.json();
  const stream = agent.stream(message, { sessionId });
  return new Response(agentToSSE(stream), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
```

Stream events follow the AG-UI format:

```typescript
{ type: 'iteration_start', iteration: 1, modelUsed: '...' }
{ type: 'text_delta', text: 'The weather' }
{ type: 'tool_call_result', tool: 'get_weather', toolResult: {...} }
{ type: 'done', iterations: 2, toolsUsed: ['get_weather'], totalLatencyMs: 3500 }
```

## Observability hooks

```typescript
const agent = new Agent({
  router,
  tools,
  onIteration: (event) => console.log('iteration', event.iteration),
  onToolCall: (event) => console.log('tool', event.tool, event.durationMs),
  onComplete: (event) => {
    console.log('run done', event.result);
    // Push to Qhaway, log cost, etc.
  },
});
```

## Without Styrr/Sayay (BYO router)

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import type { Router, RouterResponse, Message } from '@carloscortezcloud/tinkuy-agent';

// Custom router (any LLM provider)
const myRouter: Router = {
  async call(messages: Message[]): Promise<RouterResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { ... });
    return { text: '...', modelUsed: 'gpt-4o', latencyMs: 1200 };
  }
};

const agent = new Agent({ router: myRouter, tools: [...], systemPrompt: '...' });
```

## Name

**Tinkuy** (Quechua) = "where rivers meet" — where your tools, models, and budgets converge into one agent.

## Part of the FinOptix OSS Ecosystem

- 🧭 **Styrr** — LLM Router (multi-model fallback)
- ⚓ **Sayay** — Agent Cost Guardrails (budget enforcement)
- 🌊 **Tinkuy** — Agentic Framework (this package)
- 👁️ **Qhaway** — Agent Observability
- 🗺️ **Ñan** — Architecture Graph

## License

Apache 2.0
