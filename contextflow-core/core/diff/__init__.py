"""
Three-way semantic Diff engine

Implements according to docs/ARCHITECTURE.zh.md:124-141 specification:
- Based on Ring 3 sentence segmentation + MiniLM similarity
- Supports two scenarios:
  1. Commit Diff (Draft self-check): Draft vs parent Commit
  2. Merge Diff (preview): Source Commit vs Target Commit (based on common ancestor Base)
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
