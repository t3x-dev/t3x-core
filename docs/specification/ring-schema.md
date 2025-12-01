# Ring Schema Specification v1.0

> **Status**: Frozen
> **Last Updated**: 2025-12-01
> **Purpose**: Define the canonical Ring 1/2/3 data structure contract

This document defines the Ring output schema that all NLP providers must produce.
TypeScript types in `src/core/extractors/types.ts` MUST strictly match this specification.

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
| sentences[] | Ring3.segments |

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

## Versioning

- **v1.0** (2025-12-01): Initial frozen specification
  - Migrated from Python dataclasses to TypeScript interfaces
  - Field names converted to camelCase for TypeScript convention

---

## Stability Guarantees

1. **Required fields** will not be removed in minor versions
2. **Optional fields** may be added in minor versions
3. **Breaking changes** require major version bump
4. Provider-specific extensions should use `meta` fields, not top-level fields
