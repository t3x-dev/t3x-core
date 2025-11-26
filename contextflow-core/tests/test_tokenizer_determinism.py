"""Tests for deterministic tokenizer behaviour."""

from __future__ import annotations

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
