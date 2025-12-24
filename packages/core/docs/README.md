# @t3x/core

**Deterministic Semantic Engine for T3X**

T3X Core provides the foundational algorithms for semantic extraction, diff, and merge operations. All operations are deterministic and do not depend on LLMs.

---

## Installation

```bash
npm install @t3x/core
```

---

## Features

- **Ring Extraction**: Three-ring semantic extraction (keywords, facets, segments)
- **Hash Computation**: SHA-256 hashing with JCS canonicalization
- **Semantic Diff**: Two-way and three-way diff using embedding similarity
- **Three-Way Merge**: Conflict detection with automatic resolution
- **Provider Interfaces**: Pluggable NLP, Embedding, and LLM providers

---

## Quick Start

### Ring Extraction

```typescript
import { createRingExtractor, type NLPProvider } from '@t3x/core';

// Create extractor with NLP provider
const extractor = createRingExtractor(nlpProvider, {
  keywordPosTags: ['NOUN', 'PROPN', 'VERB', 'ADJ'],
  minEntitySalience: 0.01,
});

// Extract rings from text
const rings = await extractor.extract(
  "I want to visit Japan in November with a budget of $2000"
);

console.log(rings.ring1.keywords);
// [{ text: 'visit', lemma: 'visit', polarity: 1, pos: 'VERB' }, ...]

console.log(rings.ring3.segments);
// [{ id: 's-0', text: 'I want to visit Japan in November with a budget of $2000' }]
```

### Hash Computation

```typescript
import { computeTurnHash, computeCommitHash, sha256, canonText } from '@t3x/core';

// Compute turn hash
const turnHash = computeTurnHash({
  parent_turn_hash: null,
  project_id: 'proj_abc123',
  conversation_id: 'conv_xyz789',
  role: 'user',
  content: 'Hello world',
  language: 'en',
  rings_json: null,
  created_at: '2025-01-01T00:00:00Z',
});
// "sha256:a1b2c3..."

// Compute commit hash
const commitHash = computeCommitHash({
  parent_hashes: [],
  project_id: 'proj_abc123',
  branch: 'main',
  turn_window: { start_turn_hash: 'sha256:...', end_turn_hash: 'sha256:...' },
  facet_snapshot: [{ type: 'goal', text: 'Visit Japan' }],
  created_at: '2025-01-01T00:00:00Z',
});
// "sha256:d4e5f6..."
```

### Semantic Diff

```typescript
import { createDiffEngine, type EmbeddingProvider } from '@t3x/core';

// Create diff engine with embedding provider
const diffEngine = createDiffEngine(embeddingProvider, {
  similarityThreshold: 0.8,
});

// Two-way diff
const diff = await diffEngine.diff(
  { id: 'base', segments: baseSegments },
  { id: 'target', segments: targetSegments }
);

console.log(diff.stats);
// { unchanged: 3, modified: 1, added: 2, deleted: 0 }
```

### Three-Way Merge

```typescript
import { createMergeEngine, type EmbeddingProvider } from '@t3x/core';

// Create merge engine
const mergeEngine = createMergeEngine(embeddingProvider, {
  similarityThreshold: 0.8,
});

// Three-way merge
const result = await mergeEngine.merge(
  { id: 'base', segments: baseSegments, facets: baseFacets },
  { id: 'source', segments: sourceSegments, facets: sourceFacets },
  { id: 'target', segments: targetSegments, facets: targetFacets }
);

console.log(result.conflictCount);
// 1

console.log(result.autoMerged);
// [{ facet: 'goal', source: 'both', value: 'Visit Japan' }, ...]

console.log(result.conflicts);
// [{ type: 'both_modified', facet: 'budget', source: '$2000', target: '$3000' }]
```

---

## API Reference

### Extractors

```typescript
// Create ring extractor
createRingExtractor(nlpProvider: NLPProvider, config?: ExtractorConfig): RingExtractor

interface RingExtractor {
  extract(text: string): Promise<RingOutput>;
}

interface RingOutput {
  ring1: Ring1Output;  // Keywords, entities, time anchor
  ring2: Ring2Output;  // Facets, intent seed
  ring3: Ring3Output;  // Sentence segments
}
```

### Diff Engine

```typescript
// Create diff engine
createDiffEngine(embedder: EmbeddingProvider, config?: DiffEngineConfig): DiffEngine

interface DiffEngine {
  diff(base: DiffSegment, target: DiffSegment): Promise<DiffResult>;
  diffThreeWay(base: DiffSegment, source: DiffSegment, target: DiffSegment): Promise<ThreeWayDiffResult>;
}

enum DiffType {
  UNCHANGED = 'unchanged',
  MODIFIED = 'modified',
  ADDED = 'added',
  DELETED = 'deleted',
}
```

### Merge Engine

```typescript
// Create merge engine
createMergeEngine(embedder: EmbeddingProvider, options?: MergeEngineOptions): MergeEngine

interface MergeEngine {
  merge(base: MergeSource, source: MergeSource, target: MergeSource): Promise<MergeResult>;
}

enum ConflictType {
  BOTH_MODIFIED = 'both_modified',
  SOURCE_DELETED = 'source_deleted',
  TARGET_DELETED = 'target_deleted',
}
```

### Hash Utilities

```typescript
// SHA-256 hash
sha256(input: string): string

// JCS canonicalization
canonText(json: string): string

// Compute turn hash
computeTurnHash(turn: TurnPayload): string

// Compute commit hash
computeCommitHash(commit: CommitPayload): string

// Compute text hash
computeTextHash(text: string): string
```

### Provider Interfaces

```typescript
// NLP Provider
interface NLPProvider {
  analyze(text: string): Promise<NLPAnalysis>;
}

interface NLPAnalysis {
  tokens: NLPToken[];
  entities: NLPEntity[];
  sentences: NLPSentence[];
}

// Embedding Provider
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  similarity(a: number[], b: number[]): number;
}

// LLM Provider
interface LLMProvider {
  generate(prompt: string, options?: LLMGenerateOptions): Promise<string>;
}
```

---

## Polarity Rules

The extractor uses polarity rules to determine positive/negative intent:

```typescript
import { createPolarityRuleEngine } from '@t3x/core';

const engine = createPolarityRuleEngine();

// Built-in positive verbs (polarity: 1)
// want, like, love, prefer, need, enjoy, hope, wish, plan, intend, expect, ...

// Built-in negative verbs (polarity: -1)
// avoid, hate, dislike, refuse, reject, stop, quit, cancel, prevent, ...

// Check polarity
const polarity = engine.detectPolarity(token, sentence);
// 1 (positive), -1 (negative), or 0 (neutral)
```

---

## Type Exports

```typescript
// Ring types
export type {
  PosTag,
  Polarity,
  FacetType,
  Keyword,
  Ring1Output,
  Facet,
  Ring2Output,
  Segment,
  Ring3Output,
  RingOutput,
};

// Diff types
export type {
  DiffType,
  SegmentMatch,
  SegmentDiff,
  DiffSegment,
  DiffResult,
  DiffStats,
};

// Merge types
export type {
  ConflictType,
  MergeSource,
  MergeFacet,
  AutoMergedFacet,
  MergeConflict,
  MergeResult,
  MergeStats,
};

// Provider types
export type {
  NLPToken,
  NLPEntity,
  NLPSentence,
  NLPAnalysis,
  NLPProvider,
  EmbeddingProvider,
  LLMProvider,
  LLMGenerateOptions,
};
```

---

## Testing

```bash
cd t3x-core
npm test              # Run all tests (169 tests)
npm run test:watch    # Watch mode
```

---

## Related Packages

- **@t3x/storage**: PostgreSQL persistence layer
- **t3x-webui**: Next.js web interface

---

## License

MIT

---

_Package Version: 0.1.0_
_Last Updated: 2025-12-23_
