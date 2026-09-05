# GitHub 实施索引

[完整设计计划](./README.md)

## [[Epic] Retire Leaf and deliver exact State / Commit artifacts](https://github.com/t3x-dev/t3x-core/issues/1499)

- [A1 · [Backend] Inventory Leaf callers and define retirement / retention contract](https://github.com/t3x-dev/t3x-core/issues/1502) — Backend / API / storage / CLI / MCP; depends on —
- [A2 · [Backend] Export exact committed State as YAML / JSON and renderer artifacts](https://github.com/t3x-dev/t3x-core/issues/1503) — Backend / application / API; depends on #1502
- [A3 · [Frontend] Add State / Commit Export and delivery-history entry points](https://github.com/t3x-dev/t3x-core/issues/1504) — Frontend; depends on #1503
- [A4 · [Backend] Replace Workspace Leaf output targets with version-bound delivery configuration](https://github.com/t3x-dev/t3x-core/issues/1505) — Backend / application / adapters; depends on #1502, #1503
- [A5 · [Frontend] Remove Outputs / New Leaf and preserve legacy read-only access](https://github.com/t3x-dev/t3x-core/issues/1506) — Frontend / routing; depends on #1504, #1505
- [A6 · [Backend] Retire Leaf generation writers and qualify legacy compatibility](https://github.com/t3x-dev/t3x-core/issues/1507) — Backend / CLI / MCP / QA; depends on #1502, #1506

## [[Epic] Implement State Overview with authored README and resolved rendering](https://github.com/t3x-dev/t3x-core/issues/1500)

- [B1 · [Frontend] Reconcile JJY State UI branch onto dev without replacing its node views](https://github.com/t3x-dev/t3x-core/issues/1508) — Frontend / integration; depends on —
- [B2 · [Backend] Version project description, README, avatar and loose tags as presentation resources](https://github.com/t3x-dev/t3x-core/issues/1509) — Backend / storage / API; depends on —
- [B3 · [Backend] Project exact-state summaries and scoped renderer resolution status](https://github.com/t3x-dev/t3x-core/issues/1510) — Backend / application / YSchema; depends on #1509
- [B4 · [Frontend] Build compact State Overview with author content and T3X render sidebar](https://github.com/t3x-dev/t3x-core/issues/1511) — Frontend; depends on #1508, #1509, #1510
- [B5 · [Frontend] Preserve revision-aware Overview / Structure / Code navigation and author editing](https://github.com/t3x-dev/t3x-core/issues/1512) — Frontend / API integration; depends on #1509, #1511
- [B6 · [QA] Qualify State overview fidelity, resource safety and export consistency](https://github.com/t3x-dev/t3x-core/issues/1513) — QA / frontend / backend; depends on #1511, #1512, #1504

## [[Epic] Deliver Schema Discover / Browse / Studio and pinned adoption](https://github.com/t3x-dev/t3x-core/issues/1501)

- [C1 · [Backend] Publish permission-aware schema catalog and editorial tag collections](https://github.com/t3x-dev/t3x-core/issues/1514) — Backend / catalog / application; depends on #1509
- [C2 · [Frontend] Build visual Discover and compact faceted Browse](https://github.com/t3x-dev/t3x-core/issues/1515) — Frontend; depends on #1514
- [C3 · [Backend] Save Studio candidates with exact cross-project schema provenance](https://github.com/t3x-dev/t3x-core/issues/1516) — Backend / application / API; depends on #1514
- [C4 · [Frontend] Add schema project-to-Studio handoff drawer](https://github.com/t3x-dev/t3x-core/issues/1517) — Frontend; depends on #1512, #1516
- [C5 · [Backend] Compose, compare and explicitly apply pinned Studio schema selections](https://github.com/t3x-dev/t3x-core/issues/1518) — Backend / YSchema / application; depends on #1516, #1510
- [C6 · [Frontend] Build Studio compare / modules / preview and active-schema experience](https://github.com/t3x-dev/t3x-core/issues/1519) — Frontend; depends on #1517, #1518
- [C7 · [QA] Qualify the no-AI schema journey with licensed cross-domain fixtures](https://github.com/t3x-dev/t3x-core/issues/1520) — QA / catalog / integration; depends on #1515, #1519, #1513, #1506

