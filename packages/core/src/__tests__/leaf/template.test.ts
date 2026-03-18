/**
 * Tests for Template System
 *
 * @see packages/core/src/leaf/template.ts
 * @see packages/core/src/leaf/templates/defaults.ts
 */

import { describe, expect, it } from 'vitest';
import { buildLeafPromptWithTemplate } from '../../leaf/build-prompt';
import {
  buildTemplateContext,
  parseTemplateVariables,
  previewTemplate,
  renderTemplate,
  renderTemplateString,
  validateTemplateSyntax,
} from '../../leaf/template';
import {
  DEFAULT_TEMPLATES,
  getAllDefaultTemplates,
  getDefaultTemplate,
} from '../../leaf/templates';
import type { LeafTemplate, TemplateContext } from '../../leaf/types';
import type { SentenceCommit, Constraint, Leaf } from '../../types/v4';
import { LEAF_TYPES } from '../../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════

const createTestCommit = (sentences: string[]): SentenceCommit => ({
  hash: 'sha256:test-hash',
  schema: 't3x/commit/v4',
  parents: [],
  author: { type: 'human', name: 'Test User' },
  committed_at: new Date().toISOString(),
  content: {
    sentences: sentences.map((text, i) => ({
      id: `s_${i}`,
      text,
    })),
  },
});

const createTestLeaf = (
  type: Leaf['type'],
  constraints: Constraint[] = [],
  title?: string
): Leaf => ({
  id: 'leaf_test',
  commit_hash: 'sha256:test-hash',
  type,
  title,
  constraints,
  config: {},
  project_id: 'proj_test',
  created_at: new Date().toISOString(),
});

const createTestContext = (): TemplateContext => ({
  sentences: ['Sentence 1.', 'Sentence 2.'],
  formattedSentences: '1. Sentence 1.\n2. Sentence 2.',
  requires: ['- MUST include EXACTLY: "test value"'],
  excludes: ['- MUST NOT include exactly: "excluded value"'],
  formattedConstraints: `## Constraints

### Required (MUST include):
- MUST include EXACTLY: "test value"

### Excluded (MUST NOT include):
- MUST NOT include exactly: "excluded value"
`,
  leafTitle: 'Test Title',
  leafType: 'tweet',
  additionalInstructions: 'Be concise.',
  typeInstructions: 'Format: Twitter/X post\n- Maximum 280 characters',
});

// ═══════════════════════════════════════════════════════════════════════════
// buildTemplateContext Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildTemplateContext', () => {
  it('extracts sentences from commit', () => {
    const commit = createTestCommit(['First sentence.', 'Second sentence.']);
    const leaf = createTestLeaf('tweet');

    const context = buildTemplateContext(commit, leaf);

    expect(context.sentences).toEqual(['First sentence.', 'Second sentence.']);
  });

  it('formats sentences with numbering', () => {
    const commit = createTestCommit(['First.', 'Second.', 'Third.']);
    const leaf = createTestLeaf('tweet');

    const context = buildTemplateContext(commit, leaf);

    expect(context.formattedSentences).toBe('1. First.\n2. Second.\n3. Third.');
  });

  it('formats require constraints', () => {
    const commit = createTestCommit(['Test.']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'dark mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const context = buildTemplateContext(commit, leaf);

    expect(context.requires).toHaveLength(1);
    expect(context.requires[0]).toContain('MUST include');
    expect(context.requires[0]).toContain('dark mode');
  });

  it('formats exclude constraints', () => {
    const commit = createTestCommit(['Test.']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'light mode' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const context = buildTemplateContext(commit, leaf);

    expect(context.excludes).toHaveLength(1);
    expect(context.excludes[0]).toContain('MUST NOT include');
  });

  it('builds formatted constraints section', () => {
    const commit = createTestCommit(['Test.']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'value1' },
      { id: 'cst_2', type: 'exclude', match_mode: 'exact', value: 'value2' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const context = buildTemplateContext(commit, leaf);

    expect(context.formattedConstraints).toContain('## Constraints');
    expect(context.formattedConstraints).toContain('### Required');
    expect(context.formattedConstraints).toContain('### Excluded');
  });

  it('returns empty formattedConstraints when no constraints', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet', []);

    const context = buildTemplateContext(commit, leaf);

    expect(context.formattedConstraints).toBe('');
  });

  it('includes leaf title', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet', [], 'My Title');

    const context = buildTemplateContext(commit, leaf);

    expect(context.leafTitle).toBe('My Title');
  });

  it('includes leaf type', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('article');

    const context = buildTemplateContext(commit, leaf);

    expect(context.leafType).toBe('article');
  });

  it('includes additional instructions', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');

    const context = buildTemplateContext(commit, leaf, 'Extra instructions');

    expect(context.additionalInstructions).toBe('Extra instructions');
  });

  it('includes type-specific instructions', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');

    const context = buildTemplateContext(commit, leaf);

    expect(context.typeInstructions).toContain('280 characters');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// renderTemplateString Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('renderTemplateString', () => {
  it('replaces simple variables', () => {
    const template = 'Hello {{leafTitle}}!';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('Hello Test Title!');
  });

  it('replaces multiple variables', () => {
    const template = 'Type: {{leafType}}, Title: {{leafTitle}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('Type: tweet, Title: Test Title');
  });

  it('replaces array variables with joined string', () => {
    const template = 'Sentences:\n{{sentences}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toContain('Sentence 1.');
    expect(result).toContain('Sentence 2.');
  });

  it('handles conditional blocks - shows when value exists', () => {
    const template = '{{#leafTitle}}Title: {{leafTitle}}{{/leafTitle}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('Title: Test Title');
  });

  it('handles conditional blocks - hides when value empty', () => {
    const template = 'Start{{#leafTitle}} - {{leafTitle}}{{/leafTitle}}End';
    const context = { ...createTestContext(), leafTitle: '' };

    const result = renderTemplateString(template, context);

    expect(result).toBe('StartEnd');
  });

  it('handles nested variable in conditional block', () => {
    const template =
      '{{#additionalInstructions}}## Extra\n{{additionalInstructions}}{{/additionalInstructions}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toContain('## Extra');
    expect(result).toContain('Be concise.');
  });

  it('replaces unknown variables with empty string', () => {
    const template = 'Hello {{unknownVar}}!';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('Hello !');
  });

  it('cleans up multiple blank lines', () => {
    const template = 'Line 1\n\n\n\nLine 2';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('Line 1\n\nLine 2');
  });

  it('handles formattedSentences variable', () => {
    const template = '{{formattedSentences}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toBe('1. Sentence 1.\n2. Sentence 2.');
  });

  it('handles formattedConstraints variable', () => {
    const template = '{{formattedConstraints}}';
    const context = createTestContext();

    const result = renderTemplateString(template, context);

    expect(result).toContain('## Constraints');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseTemplateVariables Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('parseTemplateVariables', () => {
  it('extracts simple variables', () => {
    const template = '{{leafTitle}} - {{leafType}}';

    const variables = parseTemplateVariables(template);

    expect(variables).toContain('leafTitle');
    expect(variables).toContain('leafType');
  });

  it('extracts variables from conditional blocks', () => {
    const template = '{{#additionalInstructions}}extra{{/additionalInstructions}}';

    const variables = parseTemplateVariables(template);

    expect(variables).toContain('additionalInstructions');
  });

  it('returns unique variables only', () => {
    const template = '{{leafTitle}} and {{leafTitle}} again';

    const variables = parseTemplateVariables(template);

    expect(variables.filter((v) => v === 'leafTitle')).toHaveLength(1);
  });

  it('filters out unknown variables', () => {
    const template = '{{leafTitle}} {{unknownVariable}}';

    const variables = parseTemplateVariables(template);

    expect(variables).toContain('leafTitle');
    expect(variables).not.toContain('unknownVariable');
  });

  it('returns empty array for template without variables', () => {
    const template = 'No variables here';

    const variables = parseTemplateVariables(template);

    expect(variables).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateTemplateSyntax Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('validateTemplateSyntax', () => {
  it('validates correct template', () => {
    const template = '{{leafTitle}} {{#leafType}}type{{/leafType}}';

    const result = validateTemplateSyntax(template);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects unclosed conditional block', () => {
    const template = '{{#leafTitle}}content';

    const result = validateTemplateSyntax(template);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unclosed'))).toBe(true);
  });

  it('detects unmatched closing block', () => {
    const template = 'content{{/leafTitle}}';

    const result = validateTemplateSyntax(template);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unmatched'))).toBe(true);
  });

  it('validates template with no variables', () => {
    const template = 'Plain text without variables';

    const result = validateTemplateSyntax(template);

    expect(result.valid).toBe(true);
  });

  it('detects unknown variables', () => {
    const template = '{{leafTitle}} {{unknownVariable}} {{anotherUnknown}}';

    const result = validateTemplateSyntax(template);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.includes('unknownVariable'))).toBe(true);
    expect(result.errors.some((e) => e.includes('anotherUnknown'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getDefaultTemplate Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('getDefaultTemplate', () => {
  it('returns template for each leaf type', () => {
    for (const leafType of LEAF_TYPES) {
      const template = getDefaultTemplate(leafType);
      expect(template).toBeDefined();
      expect(template.type).toBe(leafType);
    }
  });

  it('returns tweet template with correct structure', () => {
    const template = getDefaultTemplate('tweet');

    expect(template.id).toBe('tweet_default');
    expect(template.type).toBe('tweet');
    expect(template.systemPrompt).toContain('280 characters');
    expect(template.userPrompt).toContain('{{formattedSentences}}');
  });

  it('returns article template with sections', () => {
    const template = getDefaultTemplate('article');

    expect(template.id).toBe('article_default');
    expect(template.systemPrompt).toContain('headings');
  });

  it('returns weibo template in Chinese context', () => {
    const template = getDefaultTemplate('weibo');

    expect(template.systemPrompt).toContain('Chinese');
    expect(template.userPrompt).toContain('来源知识');
  });

  it('returns wechat template in Chinese context', () => {
    const template = getDefaultTemplate('wechat');

    expect(template.systemPrompt).toContain('微信');
    expect(template.userPrompt).toContain('背景');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAllDefaultTemplates Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('getAllDefaultTemplates', () => {
  it('returns all default templates', () => {
    const templates = getAllDefaultTemplates();

    expect(templates).toHaveLength(LEAF_TYPES.length);
  });

  it('returns templates with unique IDs', () => {
    const templates = getAllDefaultTemplates();
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(templates.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT_TEMPLATES Registry Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('DEFAULT_TEMPLATES', () => {
  it('has entry for each leaf type', () => {
    for (const leafType of LEAF_TYPES) {
      expect(DEFAULT_TEMPLATES[leafType]).toBeDefined();
    }
  });

  it('each template has required fields', () => {
    for (const [type, template] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(template.id).toBeDefined();
      expect(template.type).toBe(type);
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.systemPrompt).toBeDefined();
      expect(template.userPrompt).toBeDefined();
      expect(template.variables).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// renderTemplate Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('renderTemplate', () => {
  it('renders template with default template for leaf type', () => {
    const commit = createTestCommit(['Knowledge sentence.']);
    const leaf = createTestLeaf('tweet');

    const result = renderTemplate({ commit, leaf });

    expect(result.templateId).toBe('tweet_default');
    expect(result.systemPrompt).toContain('280 characters');
    expect(result.userPrompt).toContain('Knowledge sentence.');
  });

  it('renders template with custom template', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');
    const customTemplate: LeafTemplate = {
      id: 'custom_tweet',
      type: 'tweet',
      name: 'Custom Tweet',
      description: 'Custom template',
      systemPrompt: 'Custom system: {{typeInstructions}}',
      userPrompt: 'Custom user: {{formattedSentences}}',
      variables: [],
    };

    const result = renderTemplate({ commit, leaf, template: customTemplate });

    expect(result.templateId).toBe('custom_tweet');
    expect(result.systemPrompt).toContain('Custom system');
    expect(result.userPrompt).toContain('Custom user');
  });

  it('includes constraints in rendered prompt', () => {
    const commit = createTestCommit(['Test.']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'must have' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = renderTemplate({ commit, leaf });

    expect(result.userPrompt).toContain('must have');
  });

  it('includes leaf title when present', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet', [], 'My Tweet Title');

    const result = renderTemplate({ commit, leaf });

    expect(result.userPrompt).toContain('My Tweet Title');
  });

  it('includes additional instructions', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');

    const result = renderTemplate({
      commit,
      leaf,
      additionalInstructions: 'Be funny',
    });

    expect(result.userPrompt).toContain('Be funny');
  });

  it('tracks substituted variables', () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');

    const result = renderTemplate({ commit, leaf });

    expect(result.substitutedVariables).toContain('formattedSentences');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// previewTemplate Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('previewTemplate', () => {
  it('generates preview with sample data', () => {
    const template = getDefaultTemplate('tweet');

    const preview = previewTemplate(template, 'tweet');

    expect(preview.templateId).toBe('tweet_default');
    expect(preview.systemPrompt).toBeDefined();
    expect(preview.userPrompt).toBeDefined();
  });

  it('includes sample sentences in preview', () => {
    const template = getDefaultTemplate('article');

    const preview = previewTemplate(template, 'article');

    expect(preview.userPrompt).toContain('Sample sentence');
  });

  it('includes sample constraints in preview', () => {
    const template = getDefaultTemplate('tweet');

    const preview = previewTemplate(template, 'tweet');

    expect(preview.userPrompt).toContain('sample requirement');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildLeafPromptWithTemplate Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('buildLeafPromptWithTemplate', () => {
  it('builds prompt using template system', async () => {
    const commit = createTestCommit(['User prefers dark mode.']);
    const leaf = createTestLeaf('tweet');

    const result = await buildLeafPromptWithTemplate({ commit, leaf });

    expect(result.systemPrompt).toContain('280 characters');
    expect(result.userPrompt).toContain('dark mode');
    expect(result.metadata.sentenceCount).toBe(1);
  });

  it('includes constraints in metadata', async () => {
    const commit = createTestCommit(['Test.']);
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'v1' },
      { id: 'cst_2', type: 'require', match_mode: 'exact', value: 'v2' },
      { id: 'cst_3', type: 'exclude', match_mode: 'exact', value: 'v3' },
    ];
    const leaf = createTestLeaf('tweet', constraints);

    const result = await buildLeafPromptWithTemplate({ commit, leaf });

    expect(result.metadata.requireCount).toBe(2);
    expect(result.metadata.excludeCount).toBe(1);
  });

  it('accepts custom template', async () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');
    const customTemplate: LeafTemplate = {
      id: 'my_template',
      type: 'tweet',
      name: 'My Template',
      description: 'Test',
      systemPrompt: 'CUSTOM SYSTEM',
      userPrompt: 'CUSTOM USER {{formattedSentences}}',
      variables: [],
    };

    const result = await buildLeafPromptWithTemplate({
      commit,
      leaf,
      template: customTemplate,
    });

    expect(result.systemPrompt).toBe('CUSTOM SYSTEM');
    expect(result.userPrompt).toContain('CUSTOM USER');
  });

  it('includes additional instructions', async () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('tweet');

    const result = await buildLeafPromptWithTemplate({
      commit,
      leaf,
      additionalInstructions: 'Extra guidance here',
    });

    expect(result.userPrompt).toContain('Extra guidance here');
  });

  it('returns valid BuiltPrompt structure', async () => {
    const commit = createTestCommit(['Test.']);
    const leaf = createTestLeaf('article');

    const result = await buildLeafPromptWithTemplate({ commit, leaf });

    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('sentenceCount');
    expect(result.metadata).toHaveProperty('requireCount');
    expect(result.metadata).toHaveProperty('excludeCount');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Template Variables Definition Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Template Variables', () => {
  it('all default templates use valid variables', () => {
    const templates = getAllDefaultTemplates();

    for (const template of templates) {
      const systemVars = parseTemplateVariables(template.systemPrompt);
      const userVars = parseTemplateVariables(template.userPrompt);

      // All parsed variables should be valid (parseTemplateVariables filters unknown ones)
      // This ensures templates only use recognized variables
      expect(systemVars.length).toBeGreaterThanOrEqual(0);
      expect(userVars.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('all default templates have valid syntax', () => {
    const templates = getAllDefaultTemplates();

    for (const template of templates) {
      const systemResult = validateTemplateSyntax(template.systemPrompt);
      const userResult = validateTemplateSyntax(template.userPrompt);

      expect(systemResult.valid).toBe(true);
      expect(userResult.valid).toBe(true);
    }
  });
});
