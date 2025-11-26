"""
Diff 类型定义
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional


class DiffType(Enum):
    """Diff 类型"""
    SAME = "same"              # 相同（相似度高于阈值）
    ADDED = "added"            # 新增（仅在目标版本中）
    REMOVED = "removed"        # 删除（仅在源版本中）
    MODIFIED = "modified"      # 修改（有匹配但内容不同）
    CONFLICT = "conflict"      # 冲突（三方合并时双方都修改）


@dataclass(frozen=True)
class SegmentMatch:
    """
    分句匹配结果

    用于记录两个分句的相似度和匹配关系。
    """

    source_segment_id: str
    target_segment_id: str
    similarity: float
    matched: bool  # 是否超过阈值


@dataclass(frozen=True)
class SegmentDiff:
    """
    单个分句的 Diff 结果

    对应文档中的"句级语义 Diff"。
    """

    segment_id: str
    text: str
    diff_type: DiffType
    similarity: Optional[float] = None  # 相似度分数（如果有匹配）
    matched_segment_id: Optional[str] = None  # 匹配的对方分句 ID
    matched_text: Optional[str] = None  # 匹配的对方分句文本
