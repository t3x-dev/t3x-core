"""
Ring 1/2/3 提取器（基于 spaCy）

按照 ARCHITECTURE.zh.md 规范实现完整的三层 Ring 提取：
- Ring 1: 关键词 + 实体 + 词形归一 + 极性标注
- Ring 2: 轻关系 / Facet（intent seed、时间窗口、偏好等）
- Ring 3: 分句结构

决定论保证：同输入 + 同配置 → 同输出
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
    基于 spaCy 的 Ring 1/2/3 提取器

    特性：
    1. 词形归一：使用 token.lemma_
    2. 极性标注：依存句法 + 规则引擎
    3. 分句：使用 spaCy 句子分割器
    4. 命名实体识别：spaCy NER
    """

    def __init__(
        self,
        config: ExtractorConfig,
        polarity_rules_path: Optional[Path] = None,
    ):
        """
        初始化提取器

        Args:
            config: 提取器配置
            polarity_rules_path: 自定义极性规则文件路径
        """
        self.config = config

        # 加载 spaCy 模型
        model_name = config.model or "en_core_web_sm"
        try:
            self.nlp: Language = spacy.load(model_name)
        except OSError:
            raise RuntimeError(
                f"spaCy model '{model_name}' not found. "
                f"Download it with: python -m spacy download {model_name}"
            )

        # 初始化极性规则引擎
        self.polarity_engine = PolarityRuleEngine(polarity_rules_path)

        # 获取 spaCy 版本（用于元数据）
        self.spacy_version = spacy.__version__

    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        从单个 turn 提取 Ring 1/2/3

        Args:
            turn_id: Turn ID
            content: Turn 文本内容

        Returns:
            RingOutput: 完整的三层 Ring
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
        提取 Ring 1：关键词主轴

        包含：
        1. 关键词（名词、动词、形容词）
        2. 命名实体
        3. 词形归一（lemma）
        4. 极性标注（基于依存树 + 规则）
        """
        keywords = []
        time_anchor = None
        topic = None

        # 提取偏好关系（谓词-宾语对，带极性）
        preference_relations = self.polarity_engine.extract_preference_relations(doc)

        # 构建极性映射：token → polarity
        polarity_map = {}
        for verb_token, obj_token, polarity in preference_relations:
            polarity_map[obj_token.i] = polarity

        # 遍历所有 token
        for token in doc:
            # 跳过标点和停用词
            if token.is_punct or token.is_stop:
                continue

            # 只保留名词、动词、形容词
            if token.pos_ not in {"NOUN", "PROPN", "VERB", "ADJ"}:
                continue

            # 获取极性（如果在 polarity_map 中）
            polarity = polarity_map.get(token.i, 0)

            # 提取命名实体类型
            entity_type = token.ent_type_ if token.ent_type_ else None

            # 检测时间锚点（DATE 实体）
            if entity_type == "DATE" and time_anchor is None:
                time_anchor = token.text

            keyword = Keyword(
                text=token.text,
                lemma=token.lemma_.lower(),  # 词形归一
                polarity=polarity,
                pos=token.pos_,
                entity_type=entity_type,
            )
            keywords.append(keyword)

        # 简单主题提取：取第一个 NOUN/PROPN
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
        提取 Ring 2：轻关系 / Facet

        包含：
        - intent_seed: 意图种子（基于动词）
        - time_window: 时间窗口（基于 DATE 实体）
        - preference_soft: 软偏好（基于极性关键词）
        - unknown_slot: 未知槽位（基于疑问词）
        """
        facets = []

        # 1. Intent Seed（基于主要动词）
        main_verbs = [token for token in doc if token.pos_ == "VERB" and token.dep_ == "ROOT"]
        if main_verbs:
            intent_verb = main_verbs[0].lemma_.lower()
            facets.append(Facet(
                facet_type="intent_seed",
                key="intent",
                value=intent_verb,
                confidence=0.9,
            ))

        # 2. Time Window（基于 Ring 1 的 time_anchor）
        if ring1.time_anchor:
            facets.append(Facet(
                facet_type="time_window",
                key="time",
                value=ring1.time_anchor,
                confidence=0.8,
            ))

        # 3. Preference Soft（基于 Ring 1 的偏好关键词）
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

        # 4. Unknown Slot（基于疑问词）
        for token in doc:
            if token.tag_ in {"WDT", "WP", "WP$", "WRB"}:  # 疑问词
                facets.append(Facet(
                    facet_type="unknown_slot",
                    key="question",
                    value=token.text,
                    confidence=0.6,
                ))

        return Ring2Output(facets=facets)

    def _extract_ring3(self, doc: Doc) -> Ring3Output:
        """
        提取 Ring 3：分句结构

        使用 spaCy 的句子分割器，将 turn 拆成句级片段。
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
        返回提取器元数据（用于可复现性）
        """
        return ExtractorMetadata(
            plugin=self.config.plugin,
            model=self.config.model or "en_core_web_sm",
            version=self.spacy_version,
            language=self.config.language,
            settings=self.config.settings or {},
        )
