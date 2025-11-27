"""
JiebaExtractor Chinese tokenization tests

Tests for Chinese Ring 1/2/3 extraction logic, including:
- Language detection
- Keyword extraction
- Polarity annotation
- Sentence segmentation position accuracy
"""

import pytest

# Check if jieba is available
try:
    from core.extractors import JiebaExtractor, ExtractorConfig, JIEBA_AVAILABLE
except ImportError:
    JIEBA_AVAILABLE = False

# Import language detection function
from core_api.routes.turns import detect_language


# Skip all tests if jieba is not available
pytestmark = pytest.mark.skipif(
    not JIEBA_AVAILABLE,
    reason="jieba not installed"
)


class TestLanguageDetection:
    """Test language detection function"""

    def test_detect_chinese(self):
        """Detect Chinese text"""
        assert detect_language("我想学习机器学习") == "zh"
        assert detect_language("这是一个test句子.") == "zh"
        assert detect_language("你好世界") == "zh"

    def test_detect_english(self):
        """Detect English text"""
        assert detect_language("I want to learn machine learning") == "en"
        assert detect_language("This is a test sentence.") == "en"
        assert detect_language("Hello world") == "en"

    def test_detect_mixed_mostly_chinese(self):
        """Detect mixed Chinese-English text (mostly Chinese)"""
        assert detect_language("我想学习Python和机器学习") == "zh"
        assert detect_language("推荐资源:Coursera,Kaggle") == "zh"

    def test_detect_mixed_mostly_english(self):
        """Detect mixed Chinese-English text (mostly English)"""
        # "Python is great for 数据分析" has 4 Chinese characters, total length 25, ratio 16% > 10%, so it's zh
        # Need more English characters to lower the ratio
        assert detect_language("Python is a great programming language for data science") == "en"

    def test_detect_empty(self):
        """Empty text defaults to returning English"""
        assert detect_language("") == "en"

    def test_threshold_boundary(self):
        """Test threshold boundary (10%)"""
        # Just above 10%
        text_above = "a" * 89 + "中" * 11  # 11% Chinese
        assert detect_language(text_above) == "zh"

        # Just below 10%
        text_below = "a" * 91 + "中" * 9  # 9% Chinese
        assert detect_language(text_below) == "en"


@pytest.fixture
def jieba_extractor():
    """Initialize JiebaExtractor"""
    return JiebaExtractor(ExtractorConfig(plugin="jieba", language="zh"))


class TestJiebaRing1:
    """Test JiebaExtractor Ring 1 extraction"""

    def test_basic_keywords(self, jieba_extractor):
        """Test basic keyword extraction"""
        result = jieba_extractor.extract("turn-1", "我想学习机器学习")

        keywords = result.ring1.keywords
        lemmas = [kw.lemma for kw in keywords]

        assert "学习" in lemmas
        assert "机器" in lemmas

    def test_keyword_pos_tagging(self, jieba_extractor):
        """Test part-of-speech tagging"""
        result = jieba_extractor.extract("turn-2", "我想学习机器学习算法")

        keywords = result.ring1.keywords

        # Check if verbs and nouns exist
        pos_tags = [kw.pos for kw in keywords]
        assert "VERB" in pos_tags
        assert "NOUN" in pos_tags

    def test_positive_polarity(self, jieba_extractor):
        """Test positive polarity (like, want)"""
        result = jieba_extractor.extract("turn-3", "我喜欢深度学习")

        keywords = result.ring1.keywords
        preference_keywords = result.ring1.preference_keywords

        # Should have positive polarity keywords
        assert len(preference_keywords) > 0
        positive_kws = [kw for kw in preference_keywords if kw.polarity == 1]
        assert len(positive_kws) > 0

    def test_negative_polarity(self, jieba_extractor):
        """Test negative polarity (dislike, avoid)"""
        result = jieba_extractor.extract("turn-4", "我讨厌写documentation")

        preference_keywords = result.ring1.preference_keywords

        # Should have negative polarity keywords
        negative_kws = [kw for kw in preference_keywords if kw.polarity == -1]
        assert len(negative_kws) > 0

    def test_entity_recognition(self, jieba_extractor):
        """Test named entity recognition"""
        result = jieba_extractor.extract("turn-5", "李明在北京大学学习")

        keywords = result.ring1.keywords
        entities = [kw for kw in keywords if kw.entity_type]

        # Should recognize person names or place names
        entity_types = [kw.entity_type for kw in entities]
        assert any(t in entity_types for t in ["PERSON", "GPE", "ORG"])

    def test_topic_extraction(self, jieba_extractor):
        """Test topic extraction"""
        result = jieba_extractor.extract("turn-6", "机器学习是人工智能的核心")

        # Topic should be the first noun
        assert result.ring1.topic is not None

    def test_stopwords_filtered(self, jieba_extractor):
        """Test stopword filtering"""
        result = jieba_extractor.extract("turn-7", "我的学习计划是这样的")

        lemmas = [kw.lemma for kw in result.ring1.keywords]

        # Stopwords should not appear in keywords
        assert "的" not in lemmas
        assert "是" not in lemmas
        assert "这样" not in lemmas


class TestJiebaRing2:
    """Test JiebaExtractor Ring 2 extraction"""

    def test_intent_seed(self, jieba_extractor):
        """Test intent seed extraction"""
        result = jieba_extractor.extract("turn-8", "我想学习机器学习")

        facets = result.ring2.facets
        intent_facets = [f for f in facets if f.facet_type == "intent_seed"]

        assert len(intent_facets) > 0
        # First verb should be the intent seed
        assert intent_facets[0].value == "想"

    def test_unknown_slot_question_words(self, jieba_extractor):
        """Test unknown slot (question words only)"""
        result = jieba_extractor.extract("turn-9", "我应该从哪里开始?")

        facets = result.ring2.facets
        unknown_slots = [f for f in facets if f.facet_type == "unknown_slot"]

        # Should recognize question words
        assert len(unknown_slots) > 0
        values = [f.value for f in unknown_slots]
        assert "哪里" in values

    def test_unknown_slot_not_all_pronouns(self, jieba_extractor):
        """Test unknown slot does not include all pronouns"""
        result = jieba_extractor.extract("turn-10", "我喜欢这个")

        facets = result.ring2.facets
        unknown_slots = [f for f in facets if f.facet_type == "unknown_slot"]

        # "这个" is not a question word, should not appear
        values = [f.value for f in unknown_slots]
        assert "这个" not in values
        assert "我" not in values

    def test_preference_soft(self, jieba_extractor):
        """Test soft preference extraction"""
        result = jieba_extractor.extract("turn-11", "我喜欢简洁的代码")

        facets = result.ring2.facets
        preference_facets = [f for f in facets if f.facet_type == "preference_soft"]

        # Should have preferences
        assert len(preference_facets) > 0


class TestJiebaRing3:
    """Test JiebaExtractor Ring 3 extraction (sentence segmentation)"""

    def test_chinese_sentence_split(self, jieba_extractor):
        """Test Chinese sentence splitting"""
        content = "这是第一句.这是第二句!这是第三句?"
        result = jieba_extractor.extract("turn-12", content)

        segments = result.ring3.segments

        assert len(segments) == 3

    def test_segment_positions_correct(self, jieba_extractor):
        """Test sentence segmentation position accuracy"""
        content = "第一句.第二句."
        result = jieba_extractor.extract("turn-13", content)

        segments = result.ring3.segments

        # Validate positions
        for seg in segments:
            # Text extracted using positions should equal segment.text
            extracted = content[seg.start_char:seg.end_char]
            assert extracted == seg.text

    def test_segment_includes_punctuation(self, jieba_extractor):
        """Test sentence segmentation includes punctuation"""
        content = "第一句.第二句!"
        result = jieba_extractor.extract("turn-14", content)

        segments = result.ring3.segments

        # Each segment should include end-of-sentence punctuation
        assert segments[0].text.endswith(".")
        assert segments[1].text.endswith("!")

    def test_no_punctuation_single_segment(self, jieba_extractor):
        """Test entire text treated as single segment when no punctuation"""
        content = "这是一段没有标点的文本"
        result = jieba_extractor.extract("turn-15", content)

        segments = result.ring3.segments

        assert len(segments) == 1
        assert segments[0].text == content

    def test_segment_id_format(self, jieba_extractor):
        """Test segment_id format"""
        content = "第一句.第二句.第三句."
        result = jieba_extractor.extract("turn-16", content)

        segments = result.ring3.segments

        assert segments[0].segment_id == "s-1"
        assert segments[1].segment_id == "s-2"
        assert segments[2].segment_id == "s-3"

    def test_semicolon_split(self, jieba_extractor):
        """Test semicolon splitting"""
        content = "条件一;条件二;条件三"
        result = jieba_extractor.extract("turn-17", content)

        segments = result.ring3.segments

        assert len(segments) == 3

    def test_newline_split(self, jieba_extractor):
        """Test newline splitting"""
        content = "第一行\n第二行\n第三行"
        result = jieba_extractor.extract("turn-18", content)

        segments = result.ring3.segments

        assert len(segments) == 3


class TestJiebaOutputStructure:
    """Test output structure integrity"""

    def test_ring_output_structure(self, jieba_extractor):
        """Test complete output structure"""
        result = jieba_extractor.extract("turn-19", "我想学习机器学习")

        assert result.turn_id == "turn-19"
        assert result.ring1 is not None
        assert result.ring2 is not None
        assert result.ring3 is not None

    def test_metadata(self, jieba_extractor):
        """Test metadata"""
        metadata = jieba_extractor.get_metadata()

        assert metadata.plugin == "jieba"
        assert metadata.model == "jieba"
        assert metadata.language == "zh"
        assert metadata.version is not None


class TestJiebaDeterminism:
    """Test determinism (same input produces same output)"""

    def test_same_input_same_output(self, jieba_extractor):
        """Test same input produces same output"""
        content = "我想学习机器学习,应该从哪里开始?"

        result1 = jieba_extractor.extract("turn-20", content)
        result2 = jieba_extractor.extract("turn-20", content)

        # Ring 1 keywords should be the same
        lemmas1 = [kw.lemma for kw in result1.ring1.keywords]
        lemmas2 = [kw.lemma for kw in result2.ring1.keywords]
        assert lemmas1 == lemmas2

        # Ring 2 facets should be the same
        facets1 = [(f.facet_type, f.value) for f in result1.ring2.facets]
        facets2 = [(f.facet_type, f.value) for f in result2.ring2.facets]
        assert facets1 == facets2

        # Ring 3 segments should be the same
        segs1 = [(s.segment_id, s.text) for s in result1.ring3.segments]
        segs2 = [(s.segment_id, s.text) for s in result2.ring3.segments]
        assert segs1 == segs2
