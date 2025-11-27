"""
Must-Have / Mustn't-Have validator

Check if generated draft text satisfies keyword constraints.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Set
import re


@dataclass(frozen=True)
class ValidationResult:
    """
    Validation result

    Attributes:
        passed: Whether validation passed
        missing_must_have: Missing Must-Have keywords
        violated_mustnt_have: Violated Mustn't-Have keywords
    """

    passed: bool
    missing_must_have: List[str]
    violated_mustnt_have: List[str]

    @property
    def is_complete(self) -> bool:
        """All Must-Have keywords are included"""
        return len(self.missing_must_have) == 0

    @property
    def is_clean(self) -> bool:
        """No Mustn't-Have violations"""
        return len(self.violated_mustnt_have) == 0


class MustHaveValidator:
    """
    Must-Have / Mustn't-Have validator

    Uses lemmatized keywords for matching to avoid missed detections due to tense/plural differences.
    """

    def __init__(self, case_sensitive: bool = False):
        """
        Initialize validator

        Args:
            case_sensitive: Whether to be case-sensitive (default is case-insensitive)
        """
        self.case_sensitive = case_sensitive

    def validate(
        self,
        text: str,
        must_have: List[str],
        mustnt_have: List[str],
    ) -> ValidationResult:
        """
        Validate if text satisfies constraints

        Args:
            text: Text to validate
            must_have: Must-Have keyword list (lemmatized)
            mustnt_have: Mustn't-Have keyword list (lemmatized)

        Returns:
            ValidationResult
        """
        # Preprocess text (lowercase, extract words)
        text_normalized = self._normalize_text(text)
        text_words = self._extract_words(text_normalized)

        # Check Must-Have
        missing_must_have = []
        for keyword in must_have:
            keyword_normalized = self._normalize_text(keyword)
            if not self._contains_word(text_words, keyword_normalized):
                missing_must_have.append(keyword)

        # Check Mustn't-Have
        violated_mustnt_have = []
        for keyword in mustnt_have:
            keyword_normalized = self._normalize_text(keyword)
            if self._contains_word(text_words, keyword_normalized):
                violated_mustnt_have.append(keyword)

        # Determine if passed
        passed = (len(missing_must_have) == 0) and (len(violated_mustnt_have) == 0)

        return ValidationResult(
            passed=passed,
            missing_must_have=missing_must_have,
            violated_mustnt_have=violated_mustnt_have,
        )

    def _normalize_text(self, text: str) -> str:
        """
        Normalize text

        Args:
            text: Original text

        Returns:
            Normalized text
        """
        if not self.case_sensitive:
            text = text.lower()
        return text

    def _extract_words(self, text: str) -> Set[str]:
        """
        Extract all words from text

        Args:
            text: Text

        Returns:
            Set of words
        """
        # Use regex to extract words (letters, digits, underscores)
        words = re.findall(r'\w+', text)
        return set(words)

    def _contains_word(self, words: Set[str], target: str) -> bool:
        """
        Check if word set contains target word

        Supports:
        1. Exact match (travel)
        2. Substring match (travel in travels)

        Args:
            words: Set of words
            target: Target word

        Returns:
            True if contained
        """
        # Exact match
        if target in words:
            return True

        # Substring match (allow word variations)
        for word in words:
            if target in word or word in target:
                return True

        return False
