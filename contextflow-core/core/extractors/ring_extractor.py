"""
Ring 1/2/3 extractor (based on spaCy)

Implements complete three-layer Ring extraction according to ARCHITECTURE.zh.md:
- Ring 1: Keywords + entities + lemmatization + polarity annotation
- Ring 2: Lightweight relations / Facets (intent seed, time window, preferences, etc.)
- Ring 3: Sentence structure

Determinism guarantee: same input + same configuration → same output
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

try:
    import spacy
    from spacy.language import Language
    from spacy.tokens import Doc
except ImportError:
    raise ImportError(
        "spaCy is required for RingExtractor. "
        "Install it with: pip install spacy && python -m spacy download en_core_web_sm"
    )

from .base import (
    ExtractorConfig,
    ExtractorMetadata,
    ExtractorPlugin,
    Facet,
    Keyword,
    Ring1Output,
    Ring2Output,
    Ring3Output,
    RingOutput,
    Segment,
)
from .polarity_rules import PolarityRuleEngine


class RingExtractor(ExtractorPlugin):
    """
    spaCy-based Ring 1/2/3 extractor

    Features:
    1. Lemmatization: uses token.lemma_
    2. Polarity annotation: dependency parsing + rule engine
    3. Sentence segmentation: uses spaCy sentence segmenter
    4. Named entity recognition: spaCy NER
    """

    def __init__(
        self,
        config: ExtractorConfig,
        polarity_rules_path: Optional[Path] = None,
    ):
        """
        Initialize extractor

        Args:
            config: extractor configuration
            polarity_rules_path: custom polarity rules file path
        """
        self.config = config

        # load spaCy model
        model_name = config.model or "en_core_web_sm"
        try:
            self.nlp: Language = spacy.load(model_name)
        except OSError:
            raise RuntimeError(
                f"spaCy model '{model_name}' not found. "
                f"Download it with: python -m spacy download {model_name}"
            )

        # Initialize polarity rule engine
        self.polarity_engine = PolarityRuleEngine(polarity_rules_path)

        # Get spaCy version (for metadata)
        self.spacy_version = spacy.__version__

    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        Extract Ring 1/2/3 from a single turn

        Args:
            turn_id: Turn ID
            content: Turn text content

        Returns:
            RingOutput: Complete three-layer Ring
        """
        doc = self.nlp(content)

        ring1 = self._extract_ring1(doc)
        ring2 = self._extract_ring2(doc, ring1)
        ring3 = self._extract_ring3(doc)

        return RingOutput(
            turn_id=turn_id,
            ring1=ring1,
            ring2=ring2,
            ring3=ring3,
        )

    def _extract_ring1(self, doc: Doc) -> Ring1Output:
        """
        Extract Ring 1: Keyword axis

        Contains:
        1. Keywords (nouns, verbs, adjectives)
        2. Named entities
        3. Lemmatization
        4. Polarity annotation (based on dependency tree + rules)
        """
        keywords = []
        time_anchor = None
        topic = None

        # Extract preference relations (verb-object pairs with polarity)
        preference_relations = self.polarity_engine.extract_preference_relations(doc)

        # Build polarity mapping: token → polarity
        polarity_map = {}
        for verb_token, obj_token, polarity in preference_relations:
            polarity_map[obj_token.i] = polarity

        # Iterate through all tokens
        for token in doc:
            # Skip punctuation and stop words
            if token.is_punct or token.is_stop:
                continue

            # Only keep nouns, verbs, adjectives
            if token.pos_ not in {"NOUN", "PROPN", "VERB", "ADJ"}:
                continue

            # Get polarity (if in polarity_map)
            polarity = polarity_map.get(token.i, 0)

            # Extract named entity type
            entity_type = token.ent_type_ if token.ent_type_ else None

            # Detect time anchor (DATE entity)
            if entity_type == "DATE" and time_anchor is None:
                time_anchor = token.text

            keyword = Keyword(
                text=token.text,
                lemma=token.lemma_.lower(),  # Lemmatization
                polarity=polarity,
                pos=token.pos_,
                entity_type=entity_type,
            )
            keywords.append(keyword)

        # Simple topic extraction: take first NOUN/PROPN
        for kw in keywords:
            if kw.pos in {"NOUN", "PROPN"} and topic is None:
                topic = kw.lemma
                break

        return Ring1Output(
            keywords=keywords,
            time_anchor=time_anchor,
            topic=topic,
        )

    def _extract_ring2(self, doc: Doc, ring1: Ring1Output) -> Ring2Output:
        """
        Extract Ring 2: Lightweight relations / Facets

        Contains:
        - intent_seed: Intent seed (based on verbs)
        - time_window: Time window (based on DATE entities)
        - preference_soft: Soft preferences (based on polarity keywords)
        - unknown_slot: Unknown slots (based on question words)
        """
        facets = []

        # 1. Intent Seed (based on main verb)
        main_verbs = [token for token in doc if token.pos_ == "VERB" and token.dep_ == "ROOT"]
        if main_verbs:
            intent_verb = main_verbs[0].lemma_.lower()
            facets.append(Facet(
                facet_type="intent_seed",
                key="intent",
                value=intent_verb,
                confidence=0.9,
            ))

        # 2. Time Window (based on Ring 1's time_anchor)
        if ring1.time_anchor:
            facets.append(Facet(
                facet_type="time_window",
                key="time",
                value=ring1.time_anchor,
                confidence=0.8,
            ))

        # 3. Preference Soft (based on Ring 1's preference keywords)
        for kw in ring1.preference_keywords:
            if kw.polarity == 1:
                facets.append(Facet(
                    facet_type="preference_soft",
                    key="prefer",
                    value=kw.lemma,
                    confidence=0.7,
                ))
            elif kw.polarity == -1:
                facets.append(Facet(
                    facet_type="preference_soft",
                    key="avoid",
                    value=kw.lemma,
                    confidence=0.7,
                ))

        # 4. Unknown Slot (based on question words)
        for token in doc:
            if token.tag_ in {"WDT", "WP", "WP$", "WRB"}:  # Question words
                facets.append(Facet(
                    facet_type="unknown_slot",
                    key="question",
                    value=token.text,
                    confidence=0.6,
                ))

        return Ring2Output(facets=facets)

    def _extract_ring3(self, doc: Doc) -> Ring3Output:
        """
        Extract Ring 3: Sentence structure

        Uses spaCy's sentence segmenter to split turn into sentence-level segments.
        """
        segments = []

        for i, sent in enumerate(doc.sents, start=1):
            segment = Segment(
                segment_id=f"s-{i}",
                text=sent.text.strip(),
                start_char=sent.start_char,
                end_char=sent.end_char,
            )
            segments.append(segment)

        return Ring3Output(segments=segments)

    def get_metadata(self) -> ExtractorMetadata:
        """
        Return extractor metadata (for reproducibility)
        """
        return ExtractorMetadata(
            plugin=self.config.plugin,
            model=self.config.model or "en_core_web_sm",
            version=self.spacy_version,
            language=self.config.language,
            settings=self.config.settings or {},
        )
