"""
Deterministic tokenizer tests - PENDING IMPLEMENTATION

These tests ensure the tokenizer produces consistent output for the same input,
supporting both Latin text and CJK bigram tokenization.

Required modules:
- core.evidence.DeterministicTokenizer: Language-aware tokenizer

Test coverage:
- Latin text tokenization is deterministic across runs
- CJK text produces correct bigram tokens
- Language detection works correctly

Status: Skipped until core.evidence module is implemented
Tracking: See docs/PHASE2_EXECUTION_PLAN.md for implementation timeline
"""
from __future__ import annotations

import pytest

# Skip entire module - core.evidence module not yet implemented
# TODO: Remove skip when core.evidence module is implemented
pytest.skip(
    "core.evidence module not yet implemented",
    allow_module_level=True
)

from core.evidence import DeterministicTokenizer


def test_tokenizer_deterministic_for_latin_text() -> None:
    tokenizer = DeterministicTokenizer(lang="en")
    text = "Let's go to Osaka in late November!"
    expected = tokenizer.tokenize(text)
    for _ in range(5):
        assert tokenizer.tokenize(text) == expected


def test_tokenizer_cjk_bigram() -> None:
    tokenizer = DeterministicTokenizer(lang="zh")
    text = "我想去大阪旅行"
    tokens = tokenizer.tokenize(text)
    assert tokens == ["我想", "想去", "去大", "大阪", "阪旅", "旅行"]
