/**
 * Context Formatter Tests
 */

import type { BuiltContext } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  formatContextAsJson,
  formatContextAsMarkdown,
  formatContextForExport,
} from '../../lib/context-formatter';

function mockContext(overrides: Partial<BuiltContext> = {}): BuiltContext {
  return {
    text: 'Test content here',
    token_estimate: 42,
    sources: [{ type: 'conversation', id: 'conv_123', title: 'Test Chat' }],
    ...overrides,
  } as BuiltContext;
}

describe('formatContextAsJson', () => {
  it('returns valid JSON string', () => {
    const result = formatContextAsJson(mockContext(), 'conv_123');
    const parsed = JSON.parse(result);
    expect(parsed.metadata.conversation_id).toBe('conv_123');
    expect(parsed.metadata.format).toBe('json');
    expect(parsed.metadata.exported_at).toBeTruthy();
    expect(parsed.context.text).toBe('Test content here');
    expect(parsed.context.token_estimate).toBe(42);
  });

  it('pretty-prints with 2-space indent', () => {
    const result = formatContextAsJson(mockContext(), 'conv_1');
    expect(result).toContain('\n  ');
  });
});

describe('formatContextAsMarkdown', () => {
  it('includes title and metadata', () => {
    const result = formatContextAsMarkdown(mockContext(), 'conv_123');
    expect(result).toContain('# Context Export');
    expect(result).toContain('**Conversation ID:** conv_123');
    expect(result).toContain('**Token estimate:** 42');
  });

  it('includes content section', () => {
    const result = formatContextAsMarkdown(mockContext(), 'conv_1');
    expect(result).toContain('## Content');
    expect(result).toContain('Test content here');
  });

  it('formats sources as list', () => {
    const ctx = mockContext({
      sources: [
        { type: 'conversation', id: 'conv_1', title: 'Chat A' },
        { type: 'leaf', id: 'leaf_2', title: 'Deploy B' },
      ],
    });
    const result = formatContextAsMarkdown(ctx, 'conv_1');
    expect(result).toContain('- [conversation] conv_1 - Chat A');
    expect(result).toContain('- [leaf] leaf_2 - Deploy B');
  });

  it('shows "No sources" when empty', () => {
    const ctx = mockContext({ sources: [] });
    const result = formatContextAsMarkdown(ctx, 'conv_1');
    expect(result).toContain('_No sources_');
  });

  it('handles source without title', () => {
    const ctx = mockContext({
      sources: [{ type: 'conversation', id: 'conv_1' }],
    });
    const result = formatContextAsMarkdown(ctx, 'conv_1');
    expect(result).toContain('- [conversation] conv_1');
    expect(result).not.toContain(' - undefined');
  });
});

describe('formatContextForExport', () => {
  it('returns JSON format by default', () => {
    const result = formatContextForExport(mockContext(), 'conv_1');
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.fileExtension).toBe('json');
    expect(() => JSON.parse(result.content)).not.toThrow();
  });

  it('returns JSON format when specified', () => {
    const result = formatContextForExport(mockContext(), 'conv_1', 'json');
    expect(result.contentType).toBe('application/json; charset=utf-8');
    expect(result.fileExtension).toBe('json');
  });

  it('returns Markdown format when specified', () => {
    const result = formatContextForExport(mockContext(), 'conv_1', 'markdown');
    expect(result.contentType).toBe('text/markdown; charset=utf-8');
    expect(result.fileExtension).toBe('md');
    expect(result.content).toContain('# Context Export');
  });
});
