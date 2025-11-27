"""
Diff type definitions
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional


class DiffType(Enum):
    """Diff type"""
    SAME = "same"              # Same (similarity above threshold)
    ADDED = "added"            # Added (only in target version)
    REMOVED = "removed"        # Removed (only in source version)
    MODIFIED = "modified"      # Modified (has match but content differs)
    CONFLICT = "conflict"      # Conflict (both sides modified in three-way merge)


@dataclass(frozen=True)
class SegmentMatch:
    """
    Segment match result

    Records similarity and match relationship between two segments.
    """

    source_segment_id: str
    target_segment_id: str
    similarity: float
    matched: bool  # Whether exceeds threshold


@dataclass(frozen=True)
class SegmentDiff:
    """
    Diff result for single segment

    Corresponds to "sentence-level semantic Diff" in documentation.
    """

    segment_id: str
    text: str
    diff_type: DiffType
    similarity: Optional[float] = None  # Similarity score (if matched)
    matched_segment_id: Optional[str] = None  # Matched segment ID from other side
    matched_text: Optional[str] = None  # Matched segment text from other side
