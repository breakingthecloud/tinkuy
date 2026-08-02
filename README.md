<p align="center">
  <img alt="Tinkuy" src="https://img.shields.io/badge/🌊-Tinkuy-3B82F6?style=for-the-badge" height="50">
</p>

<p align="center">
  <b>Minimal Provider-Agnostic AI Agent Framework</b><br>
  Tool loops, budget control, multi-model routing — in ~200 lines of core logic.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#streaming">Streaming</a>
  ·
  <a href="#deterministic-ontology-validation">Ontology</a>
  ·
  <a href="#ecosystem">Ecosystem</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/@carloscortezcloud/tinkuy-agent?style=flat-square&logo=npm&color=3B82F6" alt="npm">
  <img src="https://img.shields.io/badge/license-Apache_2.0-3B82F6?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/TypeScript-5.5%2B-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/dependencies-1-yellow?style=flat-square" alt="Deps">
  <img src="https://img.shields.io/badge/size-%3E5KB-3B82F6?style=flat-square" alt="Size">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs">
</p>

---

## What Is Tinkuy?

Tinkuy (Quechua: "where rivers meet") is where your tools, models, and budgets converge into one agent loop. Call LLM → parse tool_calls → execute → feed back → repeat. No vendor lock-in, no heavy dependencies, no framework opinions.

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';
import { StyrRouter } from '@carloscortezcloud/styrr-llm';
import { SayayGuard, MemoryStorage } from '@carloscortezcloud/sayay-guard';

const getWeather = defineTool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  execute: async ({ city }) => ({ temp: 22, condition: 'sunny', city }),
});

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

const result = await agent.run('What is the weather in Lima?');
console.log(result.text);           // "The weather in Lima is 22°C and sunny."
console.log(result.iterations);     // 2
console.log(result.totalLatencyMs); // ~3500
```

## Install

```bash
npm install @carloscortezcloud/tinkuy-agent
```

## Quick Start

### 1. Install

```bash
npm install @carloscortezcloud/tinkuy-agent @carloscortezcloud/styrr-llm @carloscortezcloud/sayay-guard
```

### 2. Run your first agent

```typescript
import { Agent, defineTool } from '@carloscortezcloud/tinkuy-agent';

const agent = new Agent({
  router: { call: async () => ({ text: 'Hello!', modelUsed: 'mock', latencyMs: 0 }) },
  tools: [],
  systemPrompt: 'You are a helpful assistant.',
});

const result = await agent.run('Say hello');
console.log(result.text);
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
Agent → User: { text, iterations, toolsUsed, totalLatencyMs }
```

## Features

| Feature | Description |
|---------|-------------|
| **Tool loop** | Call LLM → parse tool_calls → execute → feed back → repeat |
| **Budget guard** | Sayay integration — block/degrade/warn before each call |
| **Multi-model** | Styrr integration — fallback chain, cheapest, fastest |
| **Streaming** | `Agent.stream()` yields AG-UI events (`text_delta`, `tool_call_result`, `done`, `blocked`) |
| **SSE helper** | `agentToSSE()` converts stream to Cloudflare Worker `Response` |
| **Observable** | `onIteration` + `onToolCall` + `onComplete` hooks |
| **Deterministic grounding** | `ontology` module — validate output vs strict graph, zero-token cost (TokenOps) |
| **Conversation state** | `MemoryConversationStore` / `KVConversationStore` with sliding windows |
| **Max iterations** | Infinite loop protection (default 10) |
| **Error resilient** | Tool errors fed back to LLM — it recovers |
| **Zero deps (core)** | Core agent loop is dependency-free; only `yaml` for the optional ontology module |
| **Tiny** | ~200 lines core logic, ~5KB bundled |

## Streaming

```typescript
import { Agent, agentToSSE } from '@carloscortezcloud/tinkuy-agent';

const stream = agent.stream(message, { sessionId });

// In a Cloudflare Worker:
return new Response(agentToSSE(stream), {
  headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
});
```

Stream events follow the AG-UI format:
```
{ type: 'iteration_start', iteration: 1, modelUsed: '...' }
{ type: 'text_delta', text: 'The weather' }
{ type: 'tool_call_result', tool: 'get_weather', toolResult: {...} }
{ type: 'done', iterations: 2, toolsUsed: ['get_weather'], totalLatencyMs: 3500 }
```

## Observability

```typescript
const agent = new Agent({
  router,
  tools,
  onIteration: (event) => console.log('iteration', event.iteration),
  onToolCall: (event) => console.log('tool', event.tool, event.durationMs),
  onComplete: (event) => {
    console.log('run done', event.result);
    // Push to Qhaway for cost/latency observability
  },
});
```

## BYO Router (No Styrr/Sayay Required)

```typescript
import { Agent } from '@carloscortezcloud/tinkuy-agent';
import type { Router, RouterResponse, Message } from '@carloscortezcloud/tinkuy-agent';

const myRouter: Router = {
  async call(messages: Message[]): Promise<RouterResponse> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', { ... });
    return { text: '...', modelUsed: 'gpt-4o', latencyMs: 1200 };
  }
};

const agent = new Agent({ router: myRouter, tools: [...], systemPrompt: '...' });
```

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

## Ecosystem

| Package | Role | npm |
|---------|------|-----|
| **Tinkuy** | Agent framework (this) | `@carloscortezcloud/tinkuy-agent` |
| **Styrr** | LLM router | `styrr` |
| **Sayay** | Cost guardrails | GitHub |
| **Qhaway** | Agent observability | `@carloscortezcloud/qhaway` |
| **TideRAG** | Edge RAG pipeline | `@carloscortezcloud/tiderag` |

## Deterministic Ontology Validation

Validate LLM output against a strict T-Box schema (entities + allowed relations + property types) in pure CPU/memory — **zero token cost**. This replaces LLM-as-a-judge for grounding decisions, per the TokenOps research.

```typescript
import { Agent } from '@carloscortezcloud/tinkuy-agent';
import { loadOntology } from '@carloscortezcloud/tinkuy-agent/ontology';

const ontology = await loadOntology('schema/tokenops_ontology.yaml');

const agent = new Agent({
  router,
  tools,
  ontology,                 // optional — without it, behavior is unchanged
  onOntologyValidated: ({ validation }) => console.log('grounded', validation.relations),
});
```

With `fail_on_unknown_relation: true` in the schema, a hallucinated entity/relation throws `OntologyViolationException` and the response is **not** persisted or billed. The validator also compresses the payload to pure data relations, feeding prompt caching.

```yaml
# schema/tokenops_ontology.yaml
ontology:
  entities:
    - name: "Client"
      properties: { id: "UUID", status: "STRING" }
    - name: "Invoice"
      properties: { id: "UUID", amount: "FLOAT", currency: "STRING" }
  allowed_relations:
    - origin: "Client"
      relation: "HAS_BILLING_DISPUTE"
      target: "Invoice"
harness_constraints:
  enforce_json_schema: true
  fail_on_unknown_relation: true   # KILL SWITCH on hallucination
```

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

<p align="center">
  Built by engineers who got tired of vendor lock-in.<br>
  <a href="https://github.com/breakingthecloud/tinkuylabs">Tinkuy Labs</a> · <a href="https://finoptix.dev">finoptix.dev</a>
</p>
<p align="center">
  <sub>Tinkuy runs on free models. Your agent framework shouldn't cost you.</sub>
</p>
