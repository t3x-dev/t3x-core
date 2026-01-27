# Ring Schema Specification v1.1

> **Status**: Frozen
> **Last Updated**: 2026-01-08
> **Purpose**: Define the canonical Ring 1/2/3 data structure contract

This document defines the Ring output schema that all NLP providers must produce.
TypeScript types in `packages/core/src/extractors/types.ts` MUST strictly match this specification.

---

## Overview

The Ring structure is a three-layer semantic representation of conversational turns:

- **Ring 1**: Keyword axis - extracted keywords with linguistic annotations
- **Ring 2**: Lightweight relations / Facets - intent, time, preferences, unknowns
- **Ring 3**: Sentence structure - segment-level breakdown

---

## RingOutput (Root)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| turnId | string | ✅ | Unique identifier of the turn |
| ring1 | Ring1Output | ✅ | Keyword axis output |
| ring2 | Ring2Output | ✅ | Facets output |
| ring3 | Ring3Output | ✅ | Sentence structure output |

---

## Ring1Output - Keyword Axis

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| keywords | Keyword[] | ✅ | Extracted keywords list |
| timeAnchor | string \| null | ❌ | Time anchor (e.g., "November 2025") |
| topic | string \| null | ❌ | Topic label |
| preferenceKeywords | Keyword[] | ❌ | Auto-filtered keywords where polarity != 0 |
| anchorCandidates | AnchorCandidate[] | ❌ | **v1.1** Anchor candidates for UI highlighting (numbers, dates, entities, phrases) |
| inputTextHash | string | ❌ | **v1.1** SHA-256 hash of input text for offset consistency verification |

### Keyword

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| text | string | ✅ | - | Original text |
| lemma | string | ✅ | - | Lemmatized form (e.g., traveling → travel) |
| polarity | -1 \| 0 \| 1 | ✅ | - | -1=negative, 0=neutral, 1=positive |
| pos | string | ✅ | - | Part-of-speech tag (NOUN, VERB, ADJ, etc.) |
| entityType | string \| null | ❌ | null | Named entity type (PERSON, GPE, DATE, etc.) |
| confidence | number | ❌ | 1.0 | Confidence score [0, 1] |

**POS Tag Values** (Universal Dependencies):
- NOUN, VERB, ADJ, ADV, PROPN (proper noun)
- ADP (preposition), DET, PRON, NUM
- PUNCT, SYM, X (other)

### AnchorCandidate (v1.1)

Anchor candidates are spans in the original text that can be "anchored" by users for semantic preservation.
Unlike keywords (which are deduplicated by lemma), anchor candidates preserve exact positions in text.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | ✅ | The candidate text (e.g., "$5000", "30 days", "Bangkok") |
| type | AnchorType | ✅ | Semantic type of the anchor |
| startChar | number | ✅ | Start character offset in original input text |
| endChar | number | ✅ | End character offset in original input text |
| confidence | number | ✅ | Confidence/salience score [0, 1] |
| source | AnchorSource | ✅ | Where this candidate was derived from |

### AnchorType (enum, v1.1)

| Value | Description | Example |
|-------|-------------|---------|
| `number` | Numeric value | `123`, `5.5` |
| `money` | Currency amount | `$5000`, `100 USD` |
| `duration` | Time duration | `30 days`, `2 months` |
| `percent` | Percentage | `15%`, `3.5%` |
| `date` | Date expression | `January 2025`, `2025-01-01` |
| `entity` | Named entity (from NLP) | `Bangkok`, `Party A` |
| `term` | Domain-specific term | `indemnify`, `terminate` |

### AnchorSource (enum, v1.1)

| Value | Description |
|-------|-------------|
| `token` | Derived from NLP token |
| `entity` | Derived from NLP named entity |
| `phrase` | Derived from phrase pattern matching (e.g., `NUM + unit`) |

---

## Ring2Output - Facets

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| facets | Facet[] | ✅ | List of extracted facets |

### Facet

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| facetType | FacetType | ✅ | - | Type of facet |
| key | string | ✅ | - | Facet key/label |
| value | any | ✅ | - | Facet value |
| confidence | number | ❌ | 1.0 | Confidence score [0, 1] |

### FacetType (enum)

| Value | Description | Example |
|-------|-------------|---------|
| `intent_seed` | Intent seed | "plan_travel", "compare_options" |
| `time_window` | Time window | "2025-11-01 to 2025-11-30" |
| `preference_soft` | Soft preference | "prefer quiet places" |
| `unknown_slot` | Unknown/TBD slot | "budget TBD" |

---

## Ring3Output - Sentence Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| segments | Segment[] | ✅ | List of sentence segments |

**分句来源**：Ring 3 segments 使用**规则分句器** (`splitSentencesRuleBased`)，不使用 Google NLP 的分句结果。规则分句更可控、更稳定。

### Segment

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| segmentId | string | ✅ | Unique segment ID (e.g., "s-1", "s-2") |
| text | string | ✅ | Segment text content |
| startChar | number | ✅ | Start character offset |
| endChar | number | ✅ | End character offset |

---

## Provider Mapping Guidelines

When implementing a new NLP provider, map its output to Ring structure as follows:

### Google Cloud NLP → Ring

| Google NLP | Ring Field |
|------------|------------|
| tokens[].lemma | Keyword.lemma |
| tokens[].partOfSpeech.tag | Keyword.pos (map to Universal Dependencies) |
| entities[].name | Keyword.text |
| entities[].type | Keyword.entityType |
| entities[].salience | Keyword.confidence |
| sentiment.score | Used for Keyword.polarity inference |
| ~~sentences[]~~ | ~~Ring3.segments~~ (已废弃，使用规则分句) |

> **Note**: Ring3.segments 不再使用 Google NLP 的 `sentences[]`，改为规则分句器 `splitSentencesRuleBased()`。

### POS Tag Mapping (Google → Universal Dependencies)

| Google NLP Tag | Universal Dependencies |
|----------------|----------------------|
| NOUN | NOUN |
| VERB | VERB |
| ADJ | ADJ |
| ADV | ADV |
| PRON | PRON |
| DET | DET |
| ADP | ADP |
| NUM | NUM |
| CONJ | CCONJ |
| PUNCT | PUNCT |
| X | X |

---

## RingExtractor Filtering (v1.0.1)

The `RingExtractor` class in `@t3x/core` applies the following filters before producing output:

### Token Filtering
| Filter | Reason | Example |
|--------|--------|---------|
| Skip `PUNCT` and `X` POS tags | Punctuation not useful | `.`, `!`, `?` |
| Skip pure symbols/punctuation | Markdown artifacts | `#`, `*`, `-`, `---` |
| Skip single-character tokens | Noise | `a` (unless DET) |
| Skip pure numeric tokens | Low value | `123`, `2025` |
| Skip stop words (~200 common words) | Too generic | `the`, `is`, `have`, `want` |

### Deduplication
- Keywords deduplicated by **lemma** (e.g., `traveling` and `travels` → one entry)
- Also tracks original text to prevent entity duplicates

### Default POS Filter
Only these POS tags are extracted as keywords (configurable):
- `NOUN`, `PROPN`, `VERB`, `ADJ`

---

## Versioning

- **v1.1** (2026-01-08): Added anchor candidates for UI highlighting
  - New optional field: `Ring1Output.anchorCandidates[]`
  - New optional field: `Ring1Output.inputTextHash`
  - New types: `AnchorCandidate`, `AnchorType`, `AnchorSource`
  - Supports phrase patterns (e.g., `$5000`, `30 days`, `15%`)
  - Preserves exact character offsets bound to NLP input text
- **v1.0.2** (2026-01-07): Ring3 分句改用规则分句器
  - 不再使用 Google NLP 的 `sentences[]`
  - 使用 `splitSentencesRuleBased()` 进行分句
- **v1.0.1** (2025-12-30): Added RingExtractor filtering documentation
- **v1.0** (2025-12-01): Initial frozen specification
  - Migrated from Python dataclasses to TypeScript interfaces
  - Field names converted to camelCase for TypeScript convention

---

## Stability Guarantees

1. **Required fields** will not be removed in minor versions
2. **Optional fields** may be added in minor versions
3. **Breaking changes** require major version bump
4. Provider-specific extensions should use `meta` fields, not top-level fields
