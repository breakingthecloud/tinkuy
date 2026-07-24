/**
 * Tinkuy Tool Registry — Register, validate, discover, and group tools
 *
 * Usage:
 *   const registry = new ToolRegistry();
 *   registry.register(myTool, 'finops');
 *   registry.register(anotherTool, 'devops');
 *
 *   const agent = new Agent({ tools: registry.all() });
 *   // or: registry.byCategory('finops')
 *   // or: registry.get('search')
 */

import type { Tool } from '../types/index.js';

export interface ToolRegistryEntry {
  tool: Tool;
  category: string;
  registeredAt: Date;
}

export interface RegistryValidationError {
  tool: string;
  field: string;
  message: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();

  /**
   * Register a tool with optional category.
   * Validates the tool schema on registration.
   * Throws if tool name already registered (use replace=true to override).
   */
  register(tool: Tool, category: string = 'default', replace: boolean = false): void {
    const errors = this.validate(tool);
    if (errors.length > 0) {
      throw new Error(`Tool "${tool.name}" validation failed: ${errors.map(e => e.message).join(', ')}`);
    }

    if (this.tools.has(tool.name) && !replace) {
      throw new Error(`Tool "${tool.name}" already registered. Use replace=true to override.`);
    }

    this.tools.set(tool.name, {
      tool,
      category,
      registeredAt: new Date(),
    });
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: Tool[], category: string = 'default'): void {
    for (const tool of tools) {
      this.register(tool, category);
    }
  }

  /**
   * Get a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool by name.
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools (for Agent config).
   */
  all(): Tool[] {
    return Array.from(this.tools.values()).map(entry => entry.tool);
  }

  /**
   * Get tools by category.
   */
  byCategory(category: string): Tool[] {
    return Array.from(this.tools.values())
      .filter(entry => entry.category === category)
      .map(entry => entry.tool);
  }

  /**
   * List all registered tool names with categories.
   */
  list(): { name: string; description: string; category: string }[] {
    return Array.from(this.tools.values()).map(entry => ({
      name: entry.tool.name,
      description: entry.tool.description,
      category: entry.category,
    }));
  }

  /**
   * Get all unique categories.
   */
  categories(): string[] {
    return [...new Set(Array.from(this.tools.values()).map(e => e.category))];
  }

  /**
   * Count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Validate a tool schema without registering.
   * Returns empty array if valid.
   */
  validate(tool: Tool): RegistryValidationError[] {
    const errors: RegistryValidationError[] = [];

    if (!tool.name || typeof tool.name !== 'string') {
      errors.push({ tool: tool.name || 'unknown', field: 'name', message: 'name is required and must be a string' });
    } else if (!/^[a-z_][a-z0-9_]*$/.test(tool.name)) {
      errors.push({ tool: tool.name, field: 'name', message: 'name must be lowercase snake_case (letters, numbers, underscores)' });
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push({ tool: tool.name || 'unknown', field: 'description', message: 'description is required' });
    } else if (tool.description.length < 10) {
      errors.push({ tool: tool.name, field: 'description', message: 'description should be at least 10 characters (helps LLM tool selection)' });
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      errors.push({ tool: tool.name || 'unknown', field: 'parameters', message: 'parameters JSON Schema is required' });
    } else if ((tool.parameters as any).type !== 'object') {
      errors.push({ tool: tool.name, field: 'parameters.type', message: 'parameters.type must be "object"' });
    }

    if (!tool.execute || typeof tool.execute !== 'function') {
      errors.push({ tool: tool.name || 'unknown', field: 'execute', message: 'execute function is required' });
    }

    return errors;
  }

  /**
   * Generate tool schemas for LLM (same format Agent uses internally).
   */
  schemas(): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
    return this.all().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
