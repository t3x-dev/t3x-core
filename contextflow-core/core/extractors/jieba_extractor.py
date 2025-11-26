"""
Ring 1/2/3 提取器（基于 jieba 中文分词）

专门用于中文文本的 Ring 提取：
- Ring 1: 关键词 + 词性标注 + 命名实体
- Ring 2: 意图识别 + Facet
- Ring 3: 分句结构

决定论保证：同输入 + 同配置 → 同输出
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

try:
    import jieba
    import jieba.posseg as pseg
    JIEBA_AVAILABLE = True
except ImportError:
    JIEBA_AVAILABLE = False

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


# 中文词性到通用词性的映射
POS_MAPPING = {
    # 名词类
    "n": "NOUN",      # 普通名词
    "nr": "PROPN",    # 人名
    "ns": "PROPN",    # 地名
    "nt": "PROPN",    # 机构名
    "nz": "PROPN",    # 其他专名
    "nl": "NOUN",     # 名词性惯用语
    "ng": "NOUN",     # 名词性语素
    # 动词类
    "v": "VERB",      # 动词
    "vd": "VERB",     # 副动词
    "vn": "VERB",     # 名动词
    "vg": "VERB",     # 动词性语素
    # 形容词类
    "a": "ADJ",       # 形容词
    "ad": "ADJ",      # 副形词
    "an": "ADJ",      # 名形词
    "ag": "ADJ",      # 形容词性语素
    # 数词量词
    "m": "NUM",       # 数词
    "q": "NUM",       # 量词
    # 时间词
    "t": "TIME",      # 时间词
    # 其他
    "d": "ADV",       # 副词
    "p": "ADP",       # 介词
    "c": "CONJ",      # 连词
    "r": "PRON",      # 代词
    "u": "PART",      # 助词
    "x": "PUNCT",     # 标点
    "w": "PUNCT",     # 标点
}

# 实体类型映射（基于词性）
ENTITY_TYPE_MAPPING = {
    "nr": "PERSON",   # 人名
    "ns": "GPE",      # 地名
    "nt": "ORG",      # 机构名
    "nz": "MISC",     # 其他专名
    "t": "DATE",      # 时间
}

# 正向动词（表示喜欢、想要）
POSITIVE_VERBS = {
    "喜欢", "想", "想要", "希望", "期待", "渴望", "热爱", "偏好",
    "推荐", "建议", "选择", "倾向", "支持", "赞成", "欣赏",
    "学习", "研究", "探索", "了解", "掌握",
}

# 负向动词（表示不喜欢、避免）
NEGATIVE_VERBS = {
    "讨厌", "不喜欢", "避免", "拒绝", "反对", "排斥", "厌恶",
    "不想", "不要", "不愿", "害怕", "担心",
}

# 停用词
STOPWORDS = {
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "那", "吗", "啊", "呢",
    "吧", "嗯", "哦", "呀", "哈", "哎", "唉", "嘿", "喂",
}

# 疑问词（用于 unknown_slot）
QUESTION_WORDS = {"什么", "哪里", "哪个", "怎么", "如何", "为什么", "多少", "几"}


class JiebaExtractor(ExtractorPlugin):
    """
    基于 jieba 的中文 Ring 1/2/3 提取器

    特性：
    1. 中文分词：使用 jieba 精确模式
    2. 词性标注：使用 jieba.posseg
    3. 命名实体：基于词性识别人名、地名、机构名
    4. 极性标注：基于正/负向动词规则
    5. 分句：基于中文标点符号，保留原始位置
    """

    def __init__(self, config: ExtractorConfig):
        """
        初始化提取器

        Args:
            config: 提取器配置
        """
        if not JIEBA_AVAILABLE:
            raise ImportError(
                "jieba is required for JiebaExtractor. "
                "Install it with: pip install jieba"
            )

        self.config = config
        self.jieba_version = jieba.__version__

        # 初始化 jieba（确保线程安全）
        jieba.initialize()

    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        从单个 turn 提取 Ring 1/2/3
        """
        # 分词并标注词性，同时记录位置
        words_with_pos = self._tokenize_with_position(content)

        ring1 = self._extract_ring1(words_with_pos)
        ring2 = self._extract_ring2(words_with_pos, ring1)
        ring3 = self._extract_ring3(content)

        return RingOutput(
            turn_id=turn_id,
            ring1=ring1,
            ring2=ring2,
            ring3=ring3,
        )

    def _tokenize_with_position(self, content: str) -> List[Tuple[str, str, int, int]]:
        """
        分词并记录每个词的位置

        Returns:
            List of (word, pos, start, end)
        """
        result = []
        current_pos = 0

        for word, flag in pseg.cut(content):
            # 在原文中找到这个词的位置
            start = content.find(word, current_pos)
            if start == -1:
                start = current_pos
            end = start + len(word)
            current_pos = end

            result.append((word, flag, start, end))

        return result

    def _extract_ring1(self, words_with_pos: List[Tuple[str, str, int, int]]) -> Ring1Output:
        """
        提取 Ring 1：关键词主轴
        """
        keywords = []
        time_anchor = None
        topic = None
        current_polarity = 0

        for word, flag, start, end in words_with_pos:
            # 跳过标点和停用词
            if flag in ("x", "w") or word in STOPWORDS:
                continue

            # 跳过单字词（除非是动词或专名）
            if len(word) == 1 and flag not in ("v", "nr", "ns", "nt", "nz"):
                continue

            # 更新极性上下文
            if word in POSITIVE_VERBS:
                current_polarity = 1
            elif word in NEGATIVE_VERBS:
                current_polarity = -1

            # 映射词性
            pos = POS_MAPPING.get(flag, "X")

            # 只保留名词、动词、形容词、时间词
            if pos not in {"NOUN", "PROPN", "VERB", "ADJ", "TIME", "NUM"}:
                if flag not in ("d", "p", "u"):
                    current_polarity = 0
                continue

            # 获取实体类型
            entity_type = ENTITY_TYPE_MAPPING.get(flag)

            # 检测时间锚点
            if flag == "t" and time_anchor is None:
                time_anchor = word

            # 确定极性
            polarity = 0
            if pos in {"NOUN", "PROPN"} and current_polarity != 0:
                polarity = current_polarity

            keyword = Keyword(
                text=word,
                lemma=word.lower(),
                polarity=polarity,
                pos=pos,
                entity_type=entity_type,
            )
            keywords.append(keyword)

            if pos in {"NOUN", "PROPN"}:
                current_polarity = 0

        # 主题提取
        for kw in keywords:
            if kw.pos in {"NOUN", "PROPN"} and topic is None:
                topic = kw.lemma
                break

        return Ring1Output(
            keywords=keywords,
            time_anchor=time_anchor,
            topic=topic,
        )

    def _extract_ring2(self, words_with_pos: List[Tuple[str, str, int, int]], ring1: Ring1Output) -> Ring2Output:
        """
        提取 Ring 2：轻关系 / Facet
        """
        facets = []

        # 1. Intent Seed
        main_verbs = [word for word, flag, _, _ in words_with_pos if flag.startswith("v")]
        if main_verbs:
            facets.append(Facet(
                facet_type="intent_seed",
                key="intent",
                value=main_verbs[0],
                confidence=0.9,
            ))

        # 2. Time Window
        if ring1.time_anchor:
            facets.append(Facet(
                facet_type="time_window",
                key="time",
                value=ring1.time_anchor,
                confidence=0.8,
            ))

        # 3. Preference Soft
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

        # 4. Unknown Slot（仅限疑问词，不包括所有代词）
        for word, flag, _, _ in words_with_pos:
            if word in QUESTION_WORDS:
                facets.append(Facet(
                    facet_type="unknown_slot",
                    key="question",
                    value=word,
                    confidence=0.6,
                ))

        return Ring2Output(facets=facets)

    def _extract_ring3(self, content: str) -> Ring3Output:
        """
        提取 Ring 3：分句结构

        保留原始位置，不做 strip。
        """
        # 使用正则找到所有句子边界
        sentence_endings = re.compile(r'[。！？；\n]+')

        segments = []
        last_end = 0
        segment_idx = 1

        for match in sentence_endings.finditer(content):
            # 句子从 last_end 到 match.end()（包含标点）
            sent_start = last_end
            sent_end = match.end()
            sent_text = content[sent_start:sent_end]

            # 跳过纯空白
            if sent_text.strip():
                segments.append(Segment(
                    segment_id=f"s-{segment_idx}",
                    text=sent_text,
                    start_char=sent_start,
                    end_char=sent_end,
                ))
                segment_idx += 1

            last_end = sent_end

        # 处理最后一段（如果没有以句末标点结尾）
        if last_end < len(content):
            remaining = content[last_end:]
            if remaining.strip():
                segments.append(Segment(
                    segment_id=f"s-{segment_idx}",
                    text=remaining,
                    start_char=last_end,
                    end_char=len(content),
                ))

        # 如果整个内容没有分句标点，整体作为一个 segment
        if not segments:
            segments.append(Segment(
                segment_id="s-1",
                text=content,
                start_char=0,
                end_char=len(content),
            ))

        return Ring3Output(segments=segments)

    def get_metadata(self) -> ExtractorMetadata:
        """
        返回提取器元数据
        """
        return ExtractorMetadata(
            plugin="jieba",
            model="jieba",
            version=self.jieba_version,
            language=self.config.language,
            settings=self.config.settings or {},
        )
