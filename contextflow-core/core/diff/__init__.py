"""
三方语义 Diff 引擎

按照 docs/ARCHITECTURE.zh.md:124-141 规范实现：
- 基于 Ring 3 分句 + MiniLM 相似度
- 支持两种场景：
  1. Commit Diff（Draft 自检）：Draft vs 父 Commit
  2. Merge Diff（预览）：Source Commit vs Target Commit（基于共同祖先 Base）
"""

from .engine import DiffEngine, DiffResult, EmbeddingProvider
from .types import DiffType, SegmentDiff, SegmentMatch

__all__ = [
    "DiffEngine",
    "DiffResult",
    "EmbeddingProvider",
    "DiffType",
    "SegmentDiff",
    "SegmentMatch",
]
