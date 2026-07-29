/**
 * SSE helpers — convert AgentStream to Server-Sent Events for CF Workers.
 *
 * @example
 * const agent = new Agent({ ... });
 * const stream = agent.stream('Hello');
 * return new Response(agentToSSE(stream), {
 *   headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
 * });
 */

import type { AgentStreamEvent } from './types/index.js';

/**
 * Convert an AgentStream async iterable into a ReadableStream for SSE responses.
 * Each event is serialized as JSON and sent as a data: line.
 *
 * The stream can be used directly in a CF Worker Response.
 *
 * @example
 * return new Response(agentToSSE(agent.stream('Hello')), {
 *   headers: { 'Content-Type': 'text/event-stream' },
 * });
 */
export function agentToSSE(stream: AsyncIterable<AgentStreamEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}
