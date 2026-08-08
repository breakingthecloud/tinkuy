import { describe, it, expect } from 'vitest';
import { extractTextToolCall } from './text-tool.js';

describe('extractTextToolCall', () => {
  it('parses { tool: "name", arguments: {} }', () => {
    const result = extractTextToolCall('{"tool":"get_sprint_status","arguments":{}}');
    expect(result).toEqual({ name: 'get_sprint_status', arguments: {} });
  });

  it('parses { name: "name", arguments: { ... } }', () => {
    const result = extractTextToolCall(
      '{"name":"explain_phase","arguments":{"phase":"BUILD"}}',
    );
    expect(result).toEqual({ name: 'explain_phase', arguments: { phase: 'BUILD' } });
  });

  it('parses { tool_calls: [{ function: { name, arguments } }] } — takes first', () => {
    const result = extractTextToolCall(
      '{"tool_calls":[{"function":{"name":"x","arguments":{}}}]}',
    );
    expect(result).toEqual({ name: 'x', arguments: {} });
  });

  it('parses tool_calls with string arguments', () => {
    const result = extractTextToolCall(
      '{"tool_calls":[{"function":{"name":"search","arguments":"{\\"q\\":\\"test\\"}"}}]}',
    );
    expect(result).toEqual({ name: 'search', arguments: { q: 'test' } });
  });

  it('parses { name: ... } with args alias', () => {
    const result = extractTextToolCall('{"name":"do_thing","args":{"x":1}}');
    expect(result).toEqual({ name: 'do_thing', arguments: { x: 1 } });
  });

  it('parses { name: ... } with input alias', () => {
    const result = extractTextToolCall('{"name":"do_thing","input":{"y":"z"}}');
    expect(result).toEqual({ name: 'do_thing', arguments: { y: 'z' } });
  });

  it('returns null for narrative text', () => {
    expect(extractTextToolCall('Voy a consultar el sprint status')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(extractTextToolCall('["a","b"]')).toBeNull();
    expect(extractTextToolCall('42')).toBeNull();
  });

  it('returns null for broken JSON', () => {
    expect(extractTextToolCall('{"tool":"x",')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractTextToolCall('')).toBeNull();
  });

  it('returns null for object missing tool/name key', () => {
    expect(extractTextToolCall('{"foo":"bar"}')).toBeNull();
  });

  it('strips markdown fences', () => {
    const result = extractTextToolCall(
      '```json\n{"tool":"get_weather","arguments":{"city":"Lima"}}\n```',
    );
    expect(result).toEqual({ name: 'get_weather', arguments: { city: 'Lima' } });
  });

  it('strips markdown fences without language tag', () => {
    const result = extractTextToolCall(
      '```\n{"name":"run","arguments":{}}\n```',
    );
    expect(result).toEqual({ name: 'run', arguments: {} });
  });

  it('returns null for fences with non-JSON content', () => {
    expect(
      extractTextToolCall('```\nnot json here\n```'),
    ).toBeNull();
  });

  it('returns null for text with embedded JSON (extra content)', () => {
    // The text must be exactly one JSON object after strip
    expect(
      extractTextToolCall('Here is a tool call: {"tool":"x","arguments":{}}'),
    ).toBeNull();
  });

  it('handles string arguments that are not valid JSON', () => {
    const result = extractTextToolCall('{"name":"test","arguments":"not json"}');
    expect(result).toEqual({ name: 'test', arguments: {} });
  });

  it('handles array arguments gracefully', () => {
    const result = extractTextToolCall('{"name":"test","arguments":[]}');
    expect(result).toEqual({ name: 'test', arguments: {} });
  });
});
