/**
 * Text-embedded tool call extraction.
 *
 * Some free models (e.g., OpenRouter nemotron) emit tool calls as JSON text
 * instead of structured `tool_calls`. This utility detects the pattern at the
 * end of an iteration so the agent can execute it instead of returning raw JSON.
 */

export interface ExtractedTextTool {
  name: string;
  arguments: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function stripFences(text: string): string {
  let result = text.trim();
  result = result.replace(/^```(?:\w+)?\s*\n?/, '');
  result = result.replace(/\n?```\s*$/, '');
  return result.trim();
}

export function extractTextToolCall(text: string): ExtractedTextTool | null {
  if (!text || typeof text !== 'string') return null;

  const cleaned = stripFences(text);
  if (!cleaned.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  // Format: { tool_calls: [{ function: { name, arguments } }] }
  if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
    const call = parsed.tool_calls[0];
    if (isRecord(call) && isRecord(call.function)) {
      const fn = call.function as Record<string, unknown>;
      const name = typeof fn.name === 'string' ? fn.name : null;
      if (name) return { name, arguments: ensureRecord(fn.arguments) };
    }
    return null;
  }

  // Format: { tool: "name", arguments: {} } or { name: "name", args: {} } or { name: "name", input: {} }
  const toolName:
    | string
    | null = typeof parsed.tool === 'string'
    ? parsed.tool
    : typeof parsed.name === 'string'
    ? parsed.name
    : null;

  if (!toolName) return null;

  const args = parsed.arguments ?? parsed.args ?? parsed.input;
  return { name: toolName, arguments: ensureRecord(args) };
}
