---
"@t3x-dev/core": patch
---

Repair extraction quotes against markdown-stripped turn content

When a turn carries inline markdown (`**bold**`, `*italic*`, `` `code` ``)
but the LLM extractor quotes the rendered (stripped) text, the bare quote
isn't a substring of raw turn content and source validation hard-fails.

`repairOpQuotes` now projects raw turn content into a stripped form while
preserving a per-character map back to raw indices. A first-occurrence
match in stripped maps to a contiguous raw span (which embeds whatever
markers fell inside the matched stretch) — preserving the verbatim-
substring invariant. Determinism is mechanical: single left-to-right
scan, no regex backtracking, no fuzzy scoring, no fragment stitching.

Reduces `unverifiable_quote` failures for assistant turns that use bold
or inline-code formatting in the source text.
