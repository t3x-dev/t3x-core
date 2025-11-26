"""
提取器基础类型定义

定义所有提取器必须遵守的接口规范。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional


@dataclass(frozen=True)
class ExtractorConfig:
    """
    提取器配置

    对应文档中的 extractor 配置段落：
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
    提取器元数据（用于可复现性追溯）
    """

    plugin: str
    model: str
    version: str
    language: str
    settings: Dict[str, Any]


# Ring 1: 关键词主轴
@dataclass(frozen=True)
class Keyword:
    """
    Ring 1 关键词输出

    必须包含：
    - text: 原始文本
    - lemma: 词形归一后的形式（使用 spaCy token.lemma_）
    - polarity: 极性标注 (-1/0/+1)
    - pos: 词性标签
    - entity_type: 实体类型（如果是命名实体）
    """

    text: str
    lemma: str  # 词形归一（travel/traveling/traveled → travel）
    polarity: Literal[-1, 0, 1]  # -1=负向, 0=中性, 1=正向
    pos: str  # 词性（NOUN, VERB, ADJ, etc.）
    entity_type: Optional[str] = None  # PERSON, GPE, DATE, etc.
    confidence: float = 1.0


@dataclass(frozen=True)
class Ring1Output:
    """Ring 1 输出：关键词主轴"""

    keywords: List[Keyword]
    time_anchor: Optional[str] = None  # 时间锚点（如 "November 2025"）
    topic: Optional[str] = None  # 主题标签
    preference_keywords: List[Keyword] = None  # 偏好关键词（polarity != 0）

    def __post_init__(self):
        # 自动提取偏好关键词
        if self.preference_keywords is None:
            object.__setattr__(
                self,
                "preference_keywords",
                [kw for kw in self.keywords if kw.polarity != 0]
            )


# Ring 2: 轻关系 / Facet
@dataclass(frozen=True)
class Facet:
    """
    Ring 2 输出：轻关系 / Facet

    包含：
    - intent_seed: 意图种子（如 "plan_travel", "compare_options"）
    - time_window: 时间窗口（如 "2025-11-01 to 2025-11-30"）
    - preference_soft: 软偏好（如 "prefer quiet places"）
    - unknown_slot: 未知槽位（如 "budget TBD"）
    """

    facet_type: Literal["intent_seed", "time_window", "preference_soft", "unknown_slot"]
    key: str
    value: Any
    confidence: float = 1.0


@dataclass(frozen=True)
class Ring2Output:
    """Ring 2 输出：轻关系 / Facet"""

    facets: List[Facet]


# Ring 3: 分句结构
@dataclass(frozen=True)
class Segment:
    """
    Ring 3 句子片段

    每个 turn 拆成句级片段，如：
    - "I want to visit Japan." → s1-1
    - "Budget is around $5000." → s1-2
    """

    segment_id: str  # e.g., "s1-1", "s1-2"
    text: str
    start_char: int
    end_char: int


@dataclass(frozen=True)
class Ring3Output:
    """Ring 3 输出：分句结构"""

    segments: List[Segment]


# 完整的 Ring 输出
@dataclass(frozen=True)
class RingOutput:
    """
    完整的 Ring 1/2/3 输出

    对应文档中的三层 Ring 结构。
    """

    turn_id: str
    ring1: Ring1Output
    ring2: Ring2Output
    ring3: Ring3Output


class ExtractorPlugin(ABC):
    """
    提取器插件接口

    所有提取器（spaCy、Stanza、rule-based）必须实现此接口。
    """

    @abstractmethod
    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        从单个 turn 提取 Ring 1/2/3

        Args:
            turn_id: Turn 的唯一标识
            content: Turn 的文本内容

        Returns:
            RingOutput: 包含三层 Ring 的完整输出
        """
        pass

    @abstractmethod
    def get_metadata(self) -> ExtractorMetadata:
        """
        返回提取器元数据（用于可复现性）
        """
        pass
