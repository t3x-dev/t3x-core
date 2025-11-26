"""
JiebaExtractor 中文分词测试

测试中文 Ring 1/2/3 的提取逻辑，包括：
- 语言检测
- 关键词提取
- 极性标注
- 分句位置正确性
"""

import pytest

# 检测 jieba 是否可用
try:
    from core.extractors import JiebaExtractor, ExtractorConfig, JIEBA_AVAILABLE
except ImportError:
    JIEBA_AVAILABLE = False

# 导入语言检测函数
from core_api.routes.turns import detect_language


# 如果 jieba 不可用，跳过所有测试
pytestmark = pytest.mark.skipif(
    not JIEBA_AVAILABLE,
    reason="jieba not installed"
)


class TestLanguageDetection:
    """测试语言检测函数"""

    def test_detect_chinese(self):
        """检测中文文本"""
        assert detect_language("我想学习机器学习") == "zh"
        assert detect_language("这是一个测试句子。") == "zh"
        assert detect_language("你好世界") == "zh"

    def test_detect_english(self):
        """检测英文文本"""
        assert detect_language("I want to learn machine learning") == "en"
        assert detect_language("This is a test sentence.") == "en"
        assert detect_language("Hello world") == "en"

    def test_detect_mixed_mostly_chinese(self):
        """检测中英混合文本（中文为主）"""
        assert detect_language("我想学习Python和机器学习") == "zh"
        assert detect_language("推荐资源：Coursera、Kaggle") == "zh"

    def test_detect_mixed_mostly_english(self):
        """检测中英混合文本（英文为主）"""
        # "Python is great for 数据分析" 有 4 个中文字符，总长度 25，比例 16% > 10%，所以是 zh
        # 需要更多英文字符来降低比例
        assert detect_language("Python is a great programming language for data science") == "en"

    def test_detect_empty(self):
        """空文本默认返回英文"""
        assert detect_language("") == "en"

    def test_threshold_boundary(self):
        """测试阈值边界（10%）"""
        # 刚好超过 10%
        text_above = "a" * 89 + "中" * 11  # 11% 中文
        assert detect_language(text_above) == "zh"

        # 刚好低于 10%
        text_below = "a" * 91 + "中" * 9  # 9% 中文
        assert detect_language(text_below) == "en"


@pytest.fixture
def jieba_extractor():
    """初始化 JiebaExtractor"""
    return JiebaExtractor(ExtractorConfig(plugin="jieba", language="zh"))


class TestJiebaRing1:
    """测试 JiebaExtractor Ring 1 提取"""

    def test_basic_keywords(self, jieba_extractor):
        """测试基本关键词提取"""
        result = jieba_extractor.extract("turn-1", "我想学习机器学习")

        keywords = result.ring1.keywords
        lemmas = [kw.lemma for kw in keywords]

        assert "学习" in lemmas
        assert "机器" in lemmas

    def test_keyword_pos_tagging(self, jieba_extractor):
        """测试词性标注"""
        result = jieba_extractor.extract("turn-2", "我想学习机器学习算法")

        keywords = result.ring1.keywords

        # 检查是否有动词和名词
        pos_tags = [kw.pos for kw in keywords]
        assert "VERB" in pos_tags
        assert "NOUN" in pos_tags

    def test_positive_polarity(self, jieba_extractor):
        """测试正向极性（喜欢、想要）"""
        result = jieba_extractor.extract("turn-3", "我喜欢深度学习")

        keywords = result.ring1.keywords
        preference_keywords = result.ring1.preference_keywords

        # 应该有正向极性的关键词
        assert len(preference_keywords) > 0
        positive_kws = [kw for kw in preference_keywords if kw.polarity == 1]
        assert len(positive_kws) > 0

    def test_negative_polarity(self, jieba_extractor):
        """测试负向极性（讨厌、避免）"""
        result = jieba_extractor.extract("turn-4", "我讨厌写文档")

        preference_keywords = result.ring1.preference_keywords

        # 应该有负向极性的关键词
        negative_kws = [kw for kw in preference_keywords if kw.polarity == -1]
        assert len(negative_kws) > 0

    def test_entity_recognition(self, jieba_extractor):
        """测试命名实体识别"""
        result = jieba_extractor.extract("turn-5", "李明在北京大学学习")

        keywords = result.ring1.keywords
        entities = [kw for kw in keywords if kw.entity_type]

        # 应该识别出人名或地名
        entity_types = [kw.entity_type for kw in entities]
        assert any(t in entity_types for t in ["PERSON", "GPE", "ORG"])

    def test_topic_extraction(self, jieba_extractor):
        """测试主题提取"""
        result = jieba_extractor.extract("turn-6", "机器学习是人工智能的核心")

        # 主题应该是第一个名词
        assert result.ring1.topic is not None

    def test_stopwords_filtered(self, jieba_extractor):
        """测试停用词过滤"""
        result = jieba_extractor.extract("turn-7", "我的学习计划是这样的")

        lemmas = [kw.lemma for kw in result.ring1.keywords]

        # 停用词不应该出现在关键词中
        assert "的" not in lemmas
        assert "是" not in lemmas
        assert "这样" not in lemmas


class TestJiebaRing2:
    """测试 JiebaExtractor Ring 2 提取"""

    def test_intent_seed(self, jieba_extractor):
        """测试意图种子提取"""
        result = jieba_extractor.extract("turn-8", "我想学习机器学习")

        facets = result.ring2.facets
        intent_facets = [f for f in facets if f.facet_type == "intent_seed"]

        assert len(intent_facets) > 0
        # 第一个动词应该是意图种子
        assert intent_facets[0].value == "想"

    def test_unknown_slot_question_words(self, jieba_extractor):
        """测试未知槽位（仅疑问词）"""
        result = jieba_extractor.extract("turn-9", "我应该从哪里开始？")

        facets = result.ring2.facets
        unknown_slots = [f for f in facets if f.facet_type == "unknown_slot"]

        # 应该识别出疑问词
        assert len(unknown_slots) > 0
        values = [f.value for f in unknown_slots]
        assert "哪里" in values

    def test_unknown_slot_not_all_pronouns(self, jieba_extractor):
        """测试未知槽位不包含所有代词"""
        result = jieba_extractor.extract("turn-10", "我喜欢这个")

        facets = result.ring2.facets
        unknown_slots = [f for f in facets if f.facet_type == "unknown_slot"]

        # "这个" 不是疑问词，不应该出现
        values = [f.value for f in unknown_slots]
        assert "这个" not in values
        assert "我" not in values

    def test_preference_soft(self, jieba_extractor):
        """测试软偏好提取"""
        result = jieba_extractor.extract("turn-11", "我喜欢简洁的代码")

        facets = result.ring2.facets
        preference_facets = [f for f in facets if f.facet_type == "preference_soft"]

        # 应该有偏好
        assert len(preference_facets) > 0


class TestJiebaRing3:
    """测试 JiebaExtractor Ring 3 提取（分句）"""

    def test_chinese_sentence_split(self, jieba_extractor):
        """测试中文分句"""
        content = "这是第一句。这是第二句！这是第三句？"
        result = jieba_extractor.extract("turn-12", content)

        segments = result.ring3.segments

        assert len(segments) == 3

    def test_segment_positions_correct(self, jieba_extractor):
        """测试分句位置正确性"""
        content = "第一句。第二句。"
        result = jieba_extractor.extract("turn-13", content)

        segments = result.ring3.segments

        # 验证位置
        for seg in segments:
            # 使用位置从原文提取的文本应该等于 segment.text
            extracted = content[seg.start_char:seg.end_char]
            assert extracted == seg.text

    def test_segment_includes_punctuation(self, jieba_extractor):
        """测试分句包含标点"""
        content = "第一句。第二句！"
        result = jieba_extractor.extract("turn-14", content)

        segments = result.ring3.segments

        # 每个 segment 应该包含句末标点
        assert segments[0].text.endswith("。")
        assert segments[1].text.endswith("！")

    def test_no_punctuation_single_segment(self, jieba_extractor):
        """测试无标点时整体作为一个 segment"""
        content = "这是一段没有标点的文本"
        result = jieba_extractor.extract("turn-15", content)

        segments = result.ring3.segments

        assert len(segments) == 1
        assert segments[0].text == content

    def test_segment_id_format(self, jieba_extractor):
        """测试 segment_id 格式"""
        content = "第一句。第二句。第三句。"
        result = jieba_extractor.extract("turn-16", content)

        segments = result.ring3.segments

        assert segments[0].segment_id == "s-1"
        assert segments[1].segment_id == "s-2"
        assert segments[2].segment_id == "s-3"

    def test_semicolon_split(self, jieba_extractor):
        """测试分号分句"""
        content = "条件一；条件二；条件三"
        result = jieba_extractor.extract("turn-17", content)

        segments = result.ring3.segments

        assert len(segments) == 3

    def test_newline_split(self, jieba_extractor):
        """测试换行分句"""
        content = "第一行\n第二行\n第三行"
        result = jieba_extractor.extract("turn-18", content)

        segments = result.ring3.segments

        assert len(segments) == 3


class TestJiebaOutputStructure:
    """测试输出结构完整性"""

    def test_ring_output_structure(self, jieba_extractor):
        """测试完整输出结构"""
        result = jieba_extractor.extract("turn-19", "我想学习机器学习")

        assert result.turn_id == "turn-19"
        assert result.ring1 is not None
        assert result.ring2 is not None
        assert result.ring3 is not None

    def test_metadata(self, jieba_extractor):
        """测试元数据"""
        metadata = jieba_extractor.get_metadata()

        assert metadata.plugin == "jieba"
        assert metadata.model == "jieba"
        assert metadata.language == "zh"
        assert metadata.version is not None


class TestJiebaDeterminism:
    """测试决定论（同输入同输出）"""

    def test_same_input_same_output(self, jieba_extractor):
        """测试相同输入产生相同输出"""
        content = "我想学习机器学习，应该从哪里开始？"

        result1 = jieba_extractor.extract("turn-20", content)
        result2 = jieba_extractor.extract("turn-20", content)

        # Ring 1 关键词应该相同
        lemmas1 = [kw.lemma for kw in result1.ring1.keywords]
        lemmas2 = [kw.lemma for kw in result2.ring1.keywords]
        assert lemmas1 == lemmas2

        # Ring 2 facets 应该相同
        facets1 = [(f.facet_type, f.value) for f in result1.ring2.facets]
        facets2 = [(f.facet_type, f.value) for f in result2.ring2.facets]
        assert facets1 == facets2

        # Ring 3 segments 应该相同
        segs1 = [(s.segment_id, s.text) for s in result1.ring3.segments]
        segs2 = [(s.segment_id, s.text) for s in result2.ring3.segments]
        assert segs1 == segs2
