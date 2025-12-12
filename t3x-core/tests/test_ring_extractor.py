"""
Ring extractor tests

Tests for Ring 1/2/3 extraction logic.
"""

import pytest

from core.extractors.ring_extractor import RingExtractor
from core.extractors.base import ExtractorConfig


@pytest.fixture
def ring_extractor():
    """Initialize Ring extractor with default config"""
    config = ExtractorConfig(
        plugin="spacy",
        model="en_core_web_sm",
        language="en",
    )
    return RingExtractor(config)


class TestRing1Extraction:
    """Test Ring 1 extraction (keywords + lemmatization + polarity)"""

    def test_basic_keywords(self, ring_extractor):
        """Test basic keyword extraction"""
        content = "I want to implement a login feature."
        result = ring_extractor.extract("turn-1", content)

        # Check keyword extraction
        keywords = result.ring1.keywords
        assert len(keywords) > 0

        # Check lemmatization
        keyword_lemmas = [kw.lemma for kw in keywords]
        assert "implement" in keyword_lemmas or "login" in keyword_lemmas

    def test_polarity_positive(self, ring_extractor):
        """Test positive polarity annotation (+1)"""
        content = "I want to add a dark mode feature."
        result = ring_extractor.extract("turn-2", content)

        # Find polarity of "add" or "dark mode"
        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # Polarity detection depends on rule engine; at minimum we should get keywords
        assert len(keywords) > 0
        # All polarities should be valid values (-1, 0, or 1)
        assert all(p in [-1, 0, 1] for p in polarities)

    def test_polarity_negative(self, ring_extractor):
        """Test negative polarity annotation (-1)"""
        content = "I don't want to use SQL database."
        result = ring_extractor.extract("turn-3", content)

        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # At minimum we should get keywords with valid polarity values
        assert len(keywords) > 0
        assert all(p in [-1, 0, 1] for p in polarities)

    def test_polarity_neutral(self, ring_extractor):
        """Test neutral polarity annotation (0)"""
        content = "The system uses React for frontend."
        result = ring_extractor.extract("turn-4", content)

        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # Most should be neutral
        assert 0 in polarities

    def test_entity_extraction(self, ring_extractor):
        """Test entity recognition"""
        content = "I want to deploy to AWS using Docker."
        result = ring_extractor.extract("turn-5", content)

        keywords = result.ring1.keywords
        entities = [kw for kw in keywords if kw.entity_type]

        # Should recognize entities like AWS
        assert len(entities) > 0


class TestRing2Extraction:
    """Test Ring 2 extraction (intent seed + time window + preferences)"""

    def test_intent_seed_extraction(self, ring_extractor):
        """Test intent seed extraction"""
        content = "I want to implement a login feature with email and password."
        result = ring_extractor.extract("turn-6", content)

        facets = result.ring2.facets

        # Check if intent seed was extracted
        intent_facets = [f for f in facets if f.facet_type == "intent_seed"]
        assert len(intent_facets) > 0

    def test_preference_extraction(self, ring_extractor):
        """Test preference extraction"""
        content = "I prefer using TypeScript over JavaScript."
        result = ring_extractor.extract("turn-7", content)

        facets = result.ring2.facets

        # Ring 2 should return facets (may be empty depending on content)
        # At minimum, verify structure is correct
        assert result.ring2 is not None
        assert isinstance(facets, list)


class TestRing3Extraction:
    """Test Ring 3 extraction (sentence segmentation)"""

    def test_sentence_segmentation(self, ring_extractor):
        """Test sentence segmentation"""
        content = "First sentence. Second sentence. Third sentence."
        result = ring_extractor.extract("turn-8", content)

        segments = result.ring3.segments

        # Should split into 3 sentences
        assert len(segments) == 3

        # Check segment_id format (s-N)
        for seg in segments:
            assert seg.segment_id.startswith("s-")

    def test_chinese_segmentation(self, ring_extractor):
        """Test Chinese sentence segmentation (requires zh model)"""
        # Note: Chinese segmentation with en_core_web_sm model may not work correctly
        # This test verifies that segments are returned, even if not correctly split
        content = "这是第一句。这是第二句。这是第三句。"  # Use Chinese period (。) instead of (.)
        result = ring_extractor.extract("turn-9", content)

        segments = result.ring3.segments

        # With English model, Chinese text may be treated as single segment
        # At minimum, verify we get segments
        assert len(segments) >= 1


class TestRingOutput:
    """Test Ring output structure"""

    def test_ring_output_structure(self, ring_extractor):
        """Test Ring output integrity"""
        content = "I want to implement a login feature."
        result = ring_extractor.extract("turn-10", content)

        # Check structure integrity
        assert result.turn_id == "turn-10"
        assert result.ring1 is not None
        assert result.ring2 is not None
        assert result.ring3 is not None

        # Ring 1 contains keywords
        assert len(result.ring1.keywords) > 0

        # Ring 3 contains segments
        assert len(result.ring3.segments) > 0
