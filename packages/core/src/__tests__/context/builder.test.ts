/**
 * Context Builder Tests
 *
 * Tests for building LLM context from commits and pins.
 */

import { describe, expect, it } from 'vitest';
import {
  buildConversationContext,
  buildLeafContext,
  buildMemoryFromPins,
  type ConversationData,
  estimateTokens,
  filterActivePins,
} from '../../context/builder';
import type { SemanticContent } from '../../semantic/types';
import type { ConversationContext, Leaf, Pin } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const mockKnowledge: SemanticContent = {
  trees: [
    { key: 'travel_plan', slots: { destination: 'Tokyo', season: 'spring' }, children: [] },
    { key: 'budget', slots: { amount: 3000, per: 'person' }, children: [] },
  ],
  relations: [{ from: 'budget', to: 'travel_plan', type: 'causes' as const }],
};

const mockConversation: ConversationData = {
  id: 'conv_1',
  title: 'Trip Planning Discussion',
  turns: [
    { role: 'user', content: 'I want to plan a trip to Japan.' },
    { role: 'assistant', content: 'Great choice! When would you like to go?' },
  ],
};

const mockLeaf: Leaf = {
  id: 'leaf_1',
  commit_hash: 'sha256:abc123',
  type: 'article',
  title: 'Travel Guide v1',
  constraints: [],
  config: {},
  output:
    'Based on your preferences, I recommend visiting Tokyo during cherry blossom season in late March to early April.',
  assertions: [
    {
      id: 'ast_1',
      constraint_id: 'cst_1',
      passed: true,
      details: 'Found mention of spring season',
      lesson: 'Always mention cherry blossom season for spring trips.',
    },
    {
      id: 'ast_2',
      constraint_id: 'cst_2',
      passed: false,
      details: 'Budget not mentioned',
      lesson: 'Include budget considerations in recommendations.',
    },
  ],
  project_id: 'proj_test',
  created_at: '2025-01-10T00:00:00Z',
};

const mockPins: Pin[] = [
  {
    id: 'pin_1',
    project_id: 'proj_test',
    type: 'conversation',
    ref_id: 'conv_1',
    pinned_at: '2025-01-10T00:00:00Z',
  },
  {
    id: 'pin_2',
    project_id: 'proj_test',
    type: 'leaf',
    ref_id: 'leaf_1',
    pinned_at: '2025-01-10T00:00:00Z',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// estimateTokens Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('estimateTokens', () => {
  it('estimates tokens based on character count', () => {
    // ~4 characters per token
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75, ceil = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25, ceil = 2
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// filterActivePins Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('filterActivePins', () => {
  it('returns no pins when config is null', () => {
    const result = filterActivePins(mockPins, null);
    expect(result).toHaveLength(0);
  });

  it('returns no pins when config is undefined', () => {
    const result = filterActivePins(mockPins, undefined);
    expect(result).toHaveLength(0);
  });

  it('returns all pins when selected_pin_ids is null', () => {
    const config: ConversationContext = {
      conversation_id: 'conv_test',
      selected_pin_ids: null,
      updated_at: '2025-01-10T00:00:00Z',
    };
    const result = filterActivePins(mockPins, config);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when selected_pin_ids is empty', () => {
    const config: ConversationContext = {
      conversation_id: 'conv_test',
      selected_pin_ids: [],
      updated_at: '2025-01-10T00:00:00Z',
    };
    const result = filterActivePins(mockPins, config);
    expect(result).toHaveLength(0);
  });

  it('returns only selected pins', () => {
    const config: ConversationContext = {
      conversation_id: 'conv_test',
      selected_pin_ids: ['pin_1'],
      updated_at: '2025-01-10T00:00:00Z',
    };
    const result = filterActivePins(mockPins, config);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pin_1');
  });

  it('handles non-existent pin IDs gracefully', () => {
    const config: ConversationContext = {
      conversation_id: 'conv_test',
      selected_pin_ids: ['pin_nonexistent'],
      updated_at: '2025-01-10T00:00:00Z',
    };
    const result = filterActivePins(mockPins, config);
    expect(result).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildConversationContext Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildConversationContext', () => {
  it('builds context with only commit when no pins', () => {
    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [],
      conversations: new Map(),
      leaves: new Map(),
    });

    expect(result.text).toContain('## Current Knowledge');
    expect(result.text).toContain('travel_plan:');
    expect(result.text).toContain('destination: Tokyo');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].type).toBe('commit');
    expect(result.token_estimate).toBeGreaterThan(0);
  });

  it('builds context with commit and pinned conversation', () => {
    const conversations = new Map<string, ConversationData>();
    conversations.set('conv_1', mockConversation);

    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [mockPins[0]], // Only conversation pin
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations,
      leaves: new Map(),
    });

    expect(result.text).toContain('## Current Knowledge');
    expect(result.text).toContain('## Recent Discussions');
    expect(result.text).toContain('Trip Planning Discussion');
    expect(result.text).toContain('I want to plan a trip to Japan.');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[1].type).toBe('conversation');
  });

  it('builds context with commit and pinned leaf', () => {
    const leaves = new Map<string, Leaf>();
    leaves.set('leaf_1', mockLeaf);

    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [mockPins[1]], // Only leaf pin
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations: new Map(),
      leaves,
    });

    expect(result.text).toContain('## Current Knowledge');
    expect(result.text).toContain('## Previous Outputs & Lessons');
    expect(result.text).toContain('Travel Guide v1');
    expect(result.text).toContain('Lesson:');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[1].type).toBe('leaf');
  });

  it('filters assertions by selected_assertion_ids', () => {
    const leaves = new Map<string, Leaf>();
    leaves.set('leaf_1', mockLeaf);

    const pinWithSelectedAssertions: Pin = {
      ...mockPins[1],
      selected_assertion_ids: ['ast_1'], // Only first assertion
    };

    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [pinWithSelectedAssertions],
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations: new Map(),
      leaves,
    });

    expect(result.text).toContain('cherry blossom season');
    expect(result.text).not.toContain('budget considerations');
  });

  it('respects context config filtering', () => {
    const conversations = new Map<string, ConversationData>();
    conversations.set('conv_1', mockConversation);
    const leaves = new Map<string, Leaf>();
    leaves.set('leaf_1', mockLeaf);

    const contextConfig: ConversationContext = {
      conversation_id: 'conv_test',
      selected_pin_ids: ['pin_1'], // Only conversation pin
      updated_at: '2025-01-10T00:00:00Z',
    };

    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: mockPins,
      contextConfig,
      conversations,
      leaves,
    });

    expect(result.text).toContain('## Recent Discussions');
    expect(result.text).not.toContain('## Previous Outputs & Lessons');
    expect(result.sources).toHaveLength(2); // commit + 1 conversation
  });

  it('handles missing knowledge gracefully', () => {
    const result = buildConversationContext({
      knowledge: undefined,
      projectPins: [],
      conversations: new Map(),
      leaves: new Map(),
    });

    expect(result.text).toBe('');
    expect(result.sources).toHaveLength(0);
    expect(result.token_estimate).toBe(0);
  });

  it('skips missing conversation data', () => {
    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [mockPins[0]], // Conversation pin
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations: new Map(), // But no conversation data
      leaves: new Map(),
    });

    expect(result.text).not.toContain('## Recent Discussions');
    expect(result.sources).toHaveLength(1); // Only commit
  });

  it('truncates long leaf output', () => {
    const longOutputLeaf: Leaf = {
      ...mockLeaf,
      output: 'A'.repeat(500), // Long output
    };
    const leaves = new Map<string, Leaf>();
    leaves.set('leaf_1', longOutputLeaf);

    const result = buildConversationContext({
      knowledge: mockKnowledge,
      projectPins: [mockPins[1]],
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations: new Map(),
      leaves,
    });

    expect(result.text).toContain('A'.repeat(200) + '...');
    expect(result.text).not.toContain('A'.repeat(300));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLeafContext Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildLeafContext', () => {
  it('builds context from semantic frames', () => {
    const result = buildLeafContext(mockKnowledge);

    expect(result.text).toContain('## Knowledge');
    expect(result.text).toContain('travel_plan:');
    expect(result.text).toContain('destination: Tokyo');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].type).toBe('commit');
    expect(result.sources[0].id).toBe('knowledge');
  });

  it('includes knowledge title in source', () => {
    const result = buildLeafContext(mockKnowledge);
    expect(result.sources[0].title).toBe('Current knowledge');
  });

  it('handles empty trees array', () => {
    const emptyKnowledge: SemanticContent = {
      trees: [],
      relations: [],
    };

    const result = buildLeafContext(emptyKnowledge);
    expect(result.text).toContain('## Knowledge');
    expect(result.sources).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildMemoryFromPins Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildMemoryFromPins', () => {
  it('builds context from pins only (no commit)', () => {
    const conversations = new Map<string, ConversationData>();
    conversations.set('conv_1', mockConversation);

    const result = buildMemoryFromPins({
      projectPins: [mockPins[0]],
      contextConfig: {
        conversation_id: 'conv_test',
        selected_pin_ids: null,
        updated_at: '2025-01-10T00:00:00Z',
      },
      conversations,
      leaves: new Map(),
    });

    expect(result.text).not.toContain('## Current Knowledge');
    expect(result.text).toContain('## Recent Discussions');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].type).toBe('conversation');
  });

  it('returns empty context when no pins provided', () => {
    const result = buildMemoryFromPins({
      projectPins: [],
      conversations: new Map(),
      leaves: new Map(),
    });

    expect(result.text).toBe('');
    expect(result.sources).toHaveLength(0);
  });
});
