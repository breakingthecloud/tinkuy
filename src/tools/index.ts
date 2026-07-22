/**
 * Tool utilities — helper functions for defining tools cleanly.
 */

import type { Tool } from '../types/index.js';

/**
 * Factory function to define a tool with full type safety.
 *
 * @example
 * const getWeather = defineTool({
 *   name: 'get_weather',
 *   description: 'Get current weather for a city',
 *   parameters: {
 *     type: 'object',
 *     properties: { city: { type: 'string', description: 'City name' } },
 *     required: ['city'],
 *   },
 *   execute: async ({ city }) => {
 *     return { temp: 22, condition: 'sunny', city };
 *   },
 * });
 */
export function defineTool(tool: Tool): Tool {
  return Object.freeze(tool);
}

/**
 * Create a simple tool from just a name, description, and handler.
 * Parameters schema auto-generated as empty object (no params).
 */
export function simpleTask(name: string, description: string, handler: () => Promise<unknown>): Tool {
  return Object.freeze({
    name,
    description,
    parameters: { type: 'object', properties: {} },
    execute: handler,
  });
}
