import { describe, it, expect, vi } from 'vitest';
import { Agent } from './core/agent.js';
import type { Router, Tool, RouterStreamEvent, Message, ConversationStore } from './types/index.js';

function mockRouter(events: RouterStreamEvent[]): Router {
  return {
    call: vi.fn().mockRejectedValue(new Error('not mocked—use stream')),
    stream: vi.fn((_messages: Message[], _options?: any) => {
      async function* gen() {
        for (const e of events) yield e;
      }
      return gen();
    }),
  };
}

async function collectStream(agent: Agent, userMessage: string, options?: any): Promise<any[]> {
  const events: any[] = [];
  for await (const event of agent.stream(userMessage, options)) {
    events.push(event);
  }
  return events;
}

describe('Agent.stream()', () => {
  it('emits text lifecycle for a simple response', async () => {
    const router = mockRouter([
      { type: 'text_delta', text: 'Hello ' },
      { type: 'text_delta', text: 'world!' },
      { type: 'done', modelUsed: 'test-model' },
    ]);

    const agent = new Agent({ router, tools: [], systemPrompt: 'You are helpful.' });
    const events = await collectStream(agent, 'Hi');

    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
    expect(events[1]).toEqual({ type: 'text_delta', text: 'Hello ' });
    expect(events[2]).toEqual({ type: 'text_delta', text: 'world!' });
    expect(events[3]).toMatchObject({ type: 'done', iterations: 1, toolsUsed: [], modelsUsed: ['test-model'] });
  });

  it('executes tools and returns result as events', async () => {
    const mockCalls: RouterStreamEvent[][] = [
      [
        { type: 'tool_call_start', toolCall: { id: 'call_1', name: 'get_weather', arguments: null } },
        { type: 'tool_call_done', toolCall: { id: 'call_1', name: 'get_weather', arguments: { location: 'Paris' } } },
        { type: 'done', modelUsed: 'test-model' },
      ],
      [
        { type: 'text_delta', text: 'It is sunny.' },
        { type: 'done', modelUsed: 'test-model' },
      ],
    ];
    let callIdx = 0;

    const router: Router = {
      call: vi.fn().mockRejectedValue(new Error('not mocked')),
      stream: vi.fn((_messages: Message[], _options?: any) => {
        const events = mockCalls[callIdx] || [];
        callIdx++;
        async function* gen() {
          for (const e of events) yield e;
        }
        return gen();
      }),
    };

    const getWeather: Tool = {
      name: 'get_weather',
      description: 'Get weather',
      parameters: { type: 'object', properties: { location: { type: 'string' } } },
      execute: vi.fn().mockResolvedValue({ temp: 22, condition: 'sunny' }),
    };

    const agent = new Agent({ router, tools: [getWeather], systemPrompt: 'You are helpful.' });
    const events = await collectStream(agent, 'Weather?');

    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
    expect(events[1]).toMatchObject({
      type: 'tool_call_result',
      tool: 'get_weather',
      toolArgs: { location: 'Paris' },
      toolResult: { temp: 22, condition: 'sunny' },
    });
    expect(events[2]).toEqual({ type: 'iteration_start', iteration: 2 });
    expect(events[3]).toEqual({ type: 'text_delta', text: 'It is sunny.' });
    expect(events[4]).toMatchObject({ type: 'done', iterations: 2 });
    expect(getWeather.execute).toHaveBeenCalledWith({ location: 'Paris' });
  });

  it('emits error event when router stream errors', async () => {
    const router = mockRouter([
      { type: 'text_delta', text: 'Partial' },
      { type: 'error', error: 'Model crashed' },
    ]);

    const agent = new Agent({ router, tools: [], systemPrompt: 'You are helpful.' });
    const events = await collectStream(agent, 'Hi');

    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
    expect(events[1]).toEqual({ type: 'text_delta', text: 'Partial' });
    expect(events[2]).toEqual({ type: 'error', error: 'Model crashed' });
  });

  it('emits blocked event when guard blocks', async () => {
    const router = mockRouter([]);
    const guard = {
      check: vi.fn().mockResolvedValue({ action: 'block', reason: 'Budget exceeded', remaining: 0 }),
      record: vi.fn(),
    };

    const agent = new Agent({ router, tools: [], systemPrompt: 'You are helpful.', guard });
    const events = await collectStream(agent, 'Hi');

    expect(events[0]).toMatchObject({ type: 'blocked', blockReason: 'Budget exceeded' });
  });

  it('saves to conversation store on completion', async () => {
    const router = mockRouter([
      { type: 'text_delta', text: 'Hello' },
      { type: 'done', modelUsed: 'test-model' },
    ]);

    const store: ConversationStore = {
      get: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    const agent = new Agent({ router, tools: [], systemPrompt: 'You are helpful.', conversationStore: store });
    await collectStream(agent, 'Hi', { sessionId: 'session-1' });

    expect(store.get).toHaveBeenCalledWith('session-1');
    expect(store.save).toHaveBeenCalledWith('session-1', expect.any(Array));
  });

  it('loads conversation history from store', async () => {
    const router = mockRouter([
      { type: 'text_delta', text: 'Follow-up reply' },
      { type: 'done', modelUsed: 'test-model' },
    ]);

    const history: Message[] = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First reply' },
    ];

    const store: ConversationStore = {
      get: vi.fn().mockResolvedValue(history),
      save: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };

    const agent = new Agent({ router, tools: [], systemPrompt: 'You are helpful.', conversationStore: store });
    const events = await collectStream(agent, 'Follow-up', { sessionId: 'session-1' });

    // Verify history was loaded
    expect(store.get).toHaveBeenCalledWith('session-1');
    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
  });

  it('handles multi-iteration tool loop', async () => {
    const mockCalls: RouterStreamEvent[][] = [
      [
        { type: 'tool_call_start', toolCall: { id: 'call_1', name: 'search', arguments: null } },
        { type: 'tool_call_done', toolCall: { id: 'call_1', name: 'search', arguments: { q: 'test' } } },
        { type: 'done', modelUsed: 'test-model' },
      ],
      [
        { type: 'text_delta', text: 'Found: ' },
        { type: 'text_delta', text: 'result' },
        { type: 'done', modelUsed: 'test-model' },
      ],
    ];
    let callIdx = 0;

    const router: Router = {
      call: vi.fn().mockRejectedValue(new Error('not mocked')),
      stream: vi.fn((_messages: Message[], _options?: any) => {
        const events = mockCalls[callIdx] || [];
        callIdx++;
        async function* gen() {
          for (const e of events) yield e;
        }
        return gen();
      }),
    };

    const searchTool: Tool = {
      name: 'search',
      description: 'Search',
      parameters: { type: 'object', properties: { q: { type: 'string' } } },
      execute: vi.fn().mockResolvedValue({ results: ['result'] }),
    };

    const agent = new Agent({ router, tools: [searchTool], systemPrompt: 'You are helpful.', maxIterations: 3 });
    const events = await collectStream(agent, 'Search something');

    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
    expect(events[1]).toMatchObject({ type: 'tool_call_result', tool: 'search' });
    expect(events[2]).toEqual({ type: 'iteration_start', iteration: 2 });
    expect(events[3]).toEqual({ type: 'text_delta', text: 'Found: ' });
    expect(events[4]).toEqual({ type: 'text_delta', text: 'result' });
    expect(events[5]).toMatchObject({ type: 'done', iterations: 2, toolsUsed: ['search'] });
  });

  it('emits error on max iterations', async () => {
    const router: Router = {
      call: vi.fn().mockRejectedValue(new Error('not mocked')),
      stream: vi.fn((_messages: Message[], _options?: any) => {
        async function* gen() {
          yield { type: 'tool_call_start', toolCall: { id: 'call_1', name: 'loop_tool', arguments: null } };
          yield { type: 'tool_call_done', toolCall: { id: 'call_1', name: 'loop_tool', arguments: {} } };
          yield { type: 'done', modelUsed: 'test-model' };
        }
        return gen();
      }),
    };

    const loopTool: Tool = {
      name: 'loop_tool',
      description: 'Loops',
      parameters: { type: 'object', properties: {} },
      execute: vi.fn().mockResolvedValue({ done: false }),
    };

    const agent = new Agent({ router, tools: [loopTool], systemPrompt: 'You are helpful.', maxIterations: 1 });
    const events = await collectStream(agent, 'Loop');

    // With maxIterations=1 and always returning tool calls, should get blocked
    expect(events[0]).toEqual({ type: 'iteration_start', iteration: 1 });
    expect(events[1]).toMatchObject({ type: 'tool_call_result', tool: 'loop_tool' });
    expect(events[2]).toEqual({ type: 'error', error: 'Max iterations reached' });
  });
});
