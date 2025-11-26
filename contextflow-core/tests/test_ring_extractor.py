"""
Ring 提取器测试

测试 Ring 1/2/3 的提取逻辑。
"""

import pytest

from core.extractors.ring_extractor import RingExtractor


@pytest.fixture
def ring_extractor():
    """初始化 Ring 提取器"""
    return RingExtractor()


class TestRing1Extraction:
    """测试 Ring 1 提取（关键词 + 词形归一 + 极性）"""

    def test_basic_keywords(self, ring_extractor):
        """测试基本关键词提取"""
        content = "I want to implement a login feature."
        result = ring_extractor.extract("turn-1", content)

        # 检查关键词提取
        keywords = result.ring1.keywords
        assert len(keywords) > 0

        # 检查词形归一
        keyword_lemmas = [kw.lemma for kw in keywords]
        assert "implement" in keyword_lemmas or "login" in keyword_lemmas

    def test_polarity_positive(self, ring_extractor):
        """测试正向极性标注（+1）"""
        content = "I want to add a dark mode feature."
        result = ring_extractor.extract("turn-2", content)

        # 查找 "add" 或 "dark mode" 的极性
        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # 应该有正向极性的关键词
        assert 1 in polarities

    def test_polarity_negative(self, ring_extractor):
        """测试负向极性标注（-1）"""
        content = "I don't want to use SQL database."
        result = ring_extractor.extract("turn-3", content)

        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # 应该有负向极性的关键词
        assert -1 in polarities

    def test_polarity_neutral(self, ring_extractor):
        """测试中性极性标注（0）"""
        content = "The system uses React for frontend."
        result = ring_extractor.extract("turn-4", content)

        keywords = result.ring1.keywords
        polarities = [kw.polarity for kw in keywords]

        # 大部分应该是中性
        assert 0 in polarities

    def test_entity_extraction(self, ring_extractor):
        """测试实体识别"""
        content = "I want to deploy to AWS using Docker."
        result = ring_extractor.extract("turn-5", content)

        keywords = result.ring1.keywords
        entities = [kw for kw in keywords if kw.entity_type]

        # 应该识别出 AWS 等实体
        assert len(entities) > 0


class TestRing2Extraction:
    """测试 Ring 2 提取（意图种子 + 时间窗口 + 偏好）"""

    def test_intent_seed_extraction(self, ring_extractor):
        """测试意图种子提取"""
        content = "I want to implement a login feature with email and password."
        result = ring_extractor.extract("turn-6", content)

        facets = result.ring2.facets

        # 检查是否提取了意图种子
        intent_facets = [f for f in facets if f.facet_type == "intent_seed"]
        assert len(intent_facets) > 0

    def test_preference_extraction(self, ring_extractor):
        """测试偏好提取"""
        content = "I prefer using TypeScript over JavaScript."
        result = ring_extractor.extract("turn-7", content)

        facets = result.ring2.facets

        # 检查是否提取了偏好
        preference_facets = [f for f in facets if f.facet_type == "preference"]
        assert len(preference_facets) > 0


class TestRing3Extraction:
    """测试 Ring 3 提取（句子分割）"""

    def test_sentence_segmentation(self, ring_extractor):
        """测试句子分割"""
        content = "First sentence. Second sentence. Third sentence."
        result = ring_extractor.extract("turn-8", content)

        segments = result.ring3.segments

        # 应该分割成 3 个句子
        assert len(segments) == 3

        # 检查 segment_id 格式
        for seg in segments:
            assert seg.segment_id.startswith("turn-8-s")

    def test_chinese_segmentation(self, ring_extractor):
        """测试中文句子分割"""
        content = "这是第一句。这是第二句。这是第三句。"
        result = ring_extractor.extract("turn-9", content)

        segments = result.ring3.segments

        # 应该正确分割中文句子
        assert len(segments) == 3


class TestRingOutput:
    """测试 Ring 输出结构"""

    def test_ring_output_structure(self, ring_extractor):
        """测试 Ring 输出的完整性"""
        content = "I want to implement a login feature."
        result = ring_extractor.extract("turn-10", content)

        # 检查结构完整性
        assert result.turn_id == "turn-10"
        assert result.ring1 is not None
        assert result.ring2 is not None
        assert result.ring3 is not None

        # Ring 1 包含关键词
        assert len(result.ring1.keywords) > 0

        # Ring 3 包含分句
        assert len(result.ring3.segments) > 0
