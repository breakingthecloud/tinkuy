# Tinkuy Development Guides / Examples

Run any example without an API key (they use an in-memory mock router):

```bash
node examples/01-minimal-agent.mjs
```

> All examples import the published package name `@carloscortezcloud/tinkuy-agent`.
> Because the package declares `exports`, Node resolves the import against this repo's
> own `dist/` (self-reference) — so the exact same code runs from a consumer project.

## Index

| # | File | Feature | What you learn |
|---|------|---------|----------------|
| 01 | [01-minimal-agent.mjs](01-minimal-agent.mjs) | `Agent` + `run()` | Minimal setup, `AgentResult` fields |
| 02 | [02-tool-loop.mjs](02-tool-loop.mjs) | `defineTool` + loop | Tools with args, multi-iteration loop, tool error recovery |
| 03 | [03-conversation.mjs](03-conversation.mjs) | `MemoryConversationStore` | Multi-turn memory across runs |
| 04 | [04-streaming-sse.mjs](04-streaming-sse.mjs) | `Agent.stream()` + `agentToSSE()` | Real-time AG-UI events, SSE for Cloudflare Workers |
| 05 | [05-text-tool-calls.mjs](05-text-tool-calls.mjs) | `extractTextToolCall` | Auto-detect tool-calls emitted as JSON text (free models) |
| 06 | [06-ontology.mjs](06-ontology.mjs) | `ontology` module | Deterministic grounding — validate LLM output at $0 |
| 07 | [07-byo-router.mjs](07-byo-router.mjs) | `Router` interface | Bring your own router — no Styrr/Sayay required |

## Guidance

- **01–04** are the fundamentals. Start here.
- **05** is the fix for free models (OpenRouter `:free` endpoints) that write
  `{"tool":"...","arguments":{}}` into the response text instead of emitting
  structured `tool_calls`. Handled automatically since v0.7.0.
- **06** shows deterministic grounding (TokenOps): validate output vs a strict
  graph schema with **zero token cost**.
- **07** shows there is no vendor lock-in: implement the 8-line `Router` interface
  and Tinkuy uses your endpoint.

All examples use a mock `Router` so they run without API keys. To use real models,
swap the mock for `new StyrRouter({ ... })` from
[`@carloscortezcloud/styrr-llm`](https://www.npmjs.com/package/@carloscortezcloud/styrr-llm).