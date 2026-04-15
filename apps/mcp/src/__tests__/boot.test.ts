/**
 * MCP server boot smoke test.
 *
 * Catches regressions where the factory fails to initialise, silently drops
 * tools, or desyncs from the documented toolset names. Cheap: no DB, no LLM,
 * no network — just constructs the factory and inspects the registered tools.
 */

import { describe, expect, it } from 'vitest';
import { createMcpServer } from '@t3x-dev/mcp-lib';

describe('mcp server boot', () => {
  it('registers the full core + advanced toolset', () => {
    const { server, tools } = createMcpServer({ toolsets: ['core', 'advanced'] });

    expect(server).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);

    // Current surface: 5 core + 3 advanced = 8 tools.
    // If this drops, a tool was silently unregistered — investigate before
    // weakening the assertion.
    expect(tools.length).toBe(8);

    const names = tools.map((t) => t.name);
    const critical = [
      't3x_query',
      't3x_commit',
      't3x_edit',
      't3x_extract',
      't3x_generate',
      't3x_diff',
      't3x_merge',
      't3x_admin',
    ];
    for (const name of critical) {
      expect(names, `missing tool: ${name}`).toContain(name);
    }
  });

  it('filters to the core toolset when advanced is omitted', () => {
    const { tools } = createMcpServer({ toolsets: ['core'] });

    expect(tools.length).toBe(5);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['t3x_query', 't3x_commit', 't3x_edit', 't3x_extract', 't3x_generate'])
    );
    expect(names).not.toContain('t3x_diff');
    expect(names).not.toContain('t3x_merge');
    expect(names).not.toContain('t3x_admin');
  });

  it('deduplicates when a toolset is listed twice', () => {
    const { tools } = createMcpServer({ toolsets: ['core', 'core'] });
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(tools.length).toBe(5);
  });
});
