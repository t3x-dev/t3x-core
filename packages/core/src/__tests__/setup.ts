/**
 * Test Setup for t3x-core
 *
 * Re-exports from shared stubs and factories.
 * Existing tests that import from './setup' continue to work.
 */

// Stubs
export {
  ExactMatchEmbeddingProvider,
  StubEmbeddingProvider,
  StubLLMProvider,
  StubNLPProvider,
  WordOverlapEmbeddingProvider,
} from './stubs';

// Factories
export {
  createContentWithDuplicates,
  createContentWithRelations,
  createFrame,
  createFrameWithSlots,
  createRelation,
  createSemanticContent,
  createTypicalContent,
  resetFrameIds,
} from './factories';

// Legacy test data (kept for existing tests)
export const testSegments = {
  login: (id: string) => ({
    segmentId: id,
    text: 'User wants to implement login feature.',
  }),
  rememberMe: (id: string) => ({
    segmentId: id,
    text: 'Add remember me option.',
  }),
  captcha: (id: string) => ({
    segmentId: id,
    text: 'Add captcha verification.',
  }),
  emailLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email and password login.',
  }),
  phoneLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email, phone, and password login.',
  }),
  wechatLogin: (id: string) => ({
    segmentId: id,
    text: 'Support email and WeChat login.',
  }),
};

export const testFacets = {
  goal: (text: string, confidence = 0.9) => ({
    type: 'goal' as const,
    facet: 'goal',
    text,
    confidence,
    keywords: text.split(' ').slice(0, 3),
  }),
  constraint: (text: string, confidence = 0.9) => ({
    type: 'constraint' as const,
    facet: 'constraint',
    text,
    confidence,
    keywords: [],
  }),
  preference: (text: string, confidence = 0.8) => ({
    type: 'preference' as const,
    facet: 'preference',
    text,
    confidence,
    keywords: [],
  }),
};
