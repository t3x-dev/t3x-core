"""
Extractor base type definitions

Defines the interface specification that all extractors must follow.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional


@dataclass(frozen=True)
class ExtractorConfig:
    """
    Extractor configuration

    Corresponds to the extractor configuration section in documentation:
    ```yaml
    extractors:
      keywords:
        plugin: spacy
        model: en_core_web_sm
      segments:
        plugin: rule_based
    ```
    """

    plugin: Literal["spacy", "jieba", "stanza", "rule_based", "custom"]
    model: Optional[str] = None  # e.g., "en_core_web_sm"
    language: str = "en"
    settings: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class ExtractorMetadata:
    """
    Extractor metadata (for reproducibility tracking)
    """

    plugin: str
    model: str
    version: str
    language: str
    settings: Dict[str, Any]


# Ring 1: Keyword axis
@dataclass(frozen=True)
class Keyword:
    """
    Ring 1 keyword output

    Must contain:
    - text: Original text
    - lemma: Lemmatized form (using spaCy token.lemma_)
    - polarity: Polarity annotation (-1/0/+1)
    - pos: Part-of-speech tag
    - entity_type: Entity type (if named entity)
    """

    text: str
    lemma: str  # Lemmatized (travel/traveling/traveled → travel)
    polarity: Literal[-1, 0, 1]  # -1=negative, 0=neutral, 1=positive
    pos: str  # Part-of-speech (NOUN, VERB, ADJ, etc.)
    entity_type: Optional[str] = None  # PERSON, GPE, DATE, etc.
    confidence: float = 1.0


@dataclass(frozen=True)
class Ring1Output:
    """Ring 1 output: Keyword axis"""

    keywords: List[Keyword]
    time_anchor: Optional[str] = None  # Time anchor (e.g., "November 2025")
    topic: Optional[str] = None  # Topic label
    preference_keywords: List[Keyword] = None  # Preference keywords (polarity != 0)

    def __post_init__(self):
        # Automatically extract preference keywords
        if self.preference_keywords is None:
            object.__setattr__(
                self,
                "preference_keywords",
                [kw for kw in self.keywords if kw.polarity != 0]
            )


# Ring 2: Lightweight relations / Facets
@dataclass(frozen=True)
class Facet:
    """
    Ring 2 output: Lightweight relations / Facets

    Contains:
    - intent_seed: Intent seed (e.g., "plan_travel", "compare_options")
    - time_window: Time window (e.g., "2025-11-01 to 2025-11-30")
    - preference_soft: Soft preferences (e.g., "prefer quiet places")
    - unknown_slot: Unknown slots (e.g., "budget TBD")
    """

    facet_type: Literal["intent_seed", "time_window", "preference_soft", "unknown_slot"]
    key: str
    value: Any
    confidence: float = 1.0


@dataclass(frozen=True)
class Ring2Output:
    """Ring 2 output: Lightweight relations / Facets"""

    facets: List[Facet]


# Ring 3: Sentence structure
@dataclass(frozen=True)
class Segment:
    """
    Ring 3 sentence segment

    Each turn is split into sentence-level segments, e.g.:
    - "I want to visit Japan." → s1-1
    - "Budget is around $5000." → s1-2
    """

    segment_id: str  # e.g., "s1-1", "s1-2"
    text: str
    start_char: int
    end_char: int


@dataclass(frozen=True)
class Ring3Output:
    """Ring 3 output: Sentence structure"""

    segments: List[Segment]


# Complete Ring output
@dataclass(frozen=True)
class RingOutput:
    """
    Complete Ring 1/2/3 output

    Corresponds to the three-layer Ring structure in documentation.
    """

    turn_id: str
    ring1: Ring1Output
    ring2: Ring2Output
    ring3: Ring3Output


class ExtractorPlugin(ABC):
    """
    Extractor plugin interface

    All extractors (spaCy, Stanza, rule-based) must implement this interface.
    """

    @abstractmethod
    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        Extract Ring 1/2/3 from a single turn

        Args:
            turn_id: Unique identifier of the turn
            content: Text content of the turn

        Returns:
            RingOutput: Complete three-layer Ring output
        """
        pass

    @abstractmethod
    def get_metadata(self) -> ExtractorMetadata:
        """
        Return extractor metadata (for reproducibility)
        """
        pass
