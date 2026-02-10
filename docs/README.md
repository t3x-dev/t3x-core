# T3X Documentation

> Last updated: 2026-02-10

## Quick Start — By Role

### All Team Members (Must Read)

| Document | Description |
|----------|-------------|
| [Product Strategy](product-strategy.md) | Product positioning, 3 gene lines, 8 reference products, milestone roadmap |
| [Product Roadmap](product-roadmap.md) | Execution plan (Phase 0→3), dependency graph, parallel work timeline |
| [Collaboration Protocol](collaboration-protocol.md) | Contract-first workflow, code ownership, task classification (F/B/FB) |

### Frontend Developer

| Document | Description |
|----------|-------------|
| [Frontend Rules](frontend-rules.md) | 10 mandatory design rules, architecture rules, code conventions, known gaps |
| [Frontend Design Principles](frontend-design-principles.md) | Visual design system, interaction principles |
| [Frontend Art Template](frontend-art-template.md) | Color palette, typography, component patterns, spacing, animation |

### Backend Developer

| Document | Description |
|----------|-------------|
| [Backend Rules](backend-rules.md) | API design patterns, storage conventions, error handling, testing, middleware |
| [API Reference](API_REFERENCE.md) | API endpoint documentation |

### Product Overview (Deep Dive)

| Document | Description |
|----------|-------------|
| [01 - Product & User Layer](product-overview/01-product-and-user-layer.md) | User stories, workflows, feature specifications |
| [02 - Architecture & Design Layer](product-overview/02-architecture-and-design-layer.md) | System architecture, data flow, component design |
| [03 - Engineering & Implementation Layer](product-overview/03-engineering-and-implementation-layer.md) | Technical implementation details, code organization |

---

## Technical Specifications

| Document | Description |
|----------|-------------|
| [V4 Semantic Layer Architecture](specification/semantic-layer-architecture.md) | CommitV4, Leaf, Pin, ConversationContext design |
| [Memory Pin System Design](specification/memory-pin-system-design.md) | Pin system for source selection and context building |
| [Words-based Diff & Merge](specification/words-based-diff-merge-architecture.md) | Diff algorithm (Jaccard + LCS), three-way merge |
| [Source Context Presentation](specification/commit-source-context-presentation.md) | How commit sources are displayed in UI |
| [Source Context Implementation Review](specification/commit-source-context-implementation-review.md) | Implementation review of source context system |

## Operations

| Document | Description |
|----------|-------------|
| [Local Testing](LOCAL_TESTING.md) | Dev environment setup, test commands |
| [Docker](docker.md) | Docker Compose setup, service configuration |
| [BVT Smoke Tests](testing/bvt-smoke.md) | Build verification test plan |
