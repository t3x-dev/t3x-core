"""
MergeAgent implementation

Per ARCHITECTURE.zh.md:257-277 specification:
- Three-way diff based on DiffEngine
- Detect conflicts (DiffType.CONFLICT)
- Automatically merge non-conflicting parts
- Optional: LLM-assisted conflict resolution (Agentic Layer)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol

from ..diff import DiffEngine, DiffResult, DiffType, SegmentDiff


# Protocol for LLM Provider (optional)
class LLMProvider(Protocol):
    """
    LLM provider interface

    Used for assisted conflict resolution (optional).
    """

    def resolve_conflict(
        self,
        base_text: str,
        source_text: str,
        target_text: str,
        context: str = "",
    ) -> str:
        """
        Resolve conflict using LLM

        Args:
            base_text: Common ancestor text
            source_text: Source branch text
            target_text: Target branch text
            context: Additional context information

        Returns:
            Resolved text
        """
        ...


@dataclass
class MergeResult:
    """
    Merge result

    Contains merged segments, conflict information, and statistics.
    """

    base_id: str
    source_id: str
    target_id: str

    # Merge result
    merged_segments: List[Dict[str, str]]  # [{"segment_id": "...", "text": "..."}]

    # Conflict information
    conflicts: List[SegmentDiff]  # Segments with DiffType.CONFLICT

    # Statistics
    total_segments: int = 0
    auto_merged_count: int = 0  # Number of successfully auto-merged segments
    conflict_count: int = 0  # Number of conflicting segments
    llm_resolved_count: int = 0  # Number of conflicts resolved by LLM

    # Diff result (for auditing)
    diff_result: Optional[DiffResult] = None


class MergeAgent:
    """
    Three-way merge agent

    Workflow:
    1. Perform three-way diff using DiffEngine
    2. Auto-merge non-conflicting parts:
       - SAME → Keep
       - ADDED → Add
       - REMOVED → Delete
       - MODIFIED → Take modified version
    3. Collect conflicts (CONFLICT)
    4. Optional: Use LLM to assist conflict resolution
    """

    def __init__(
        self,
        diff_engine: DiffEngine,
        llm_provider: Optional[LLMProvider] = None,
    ):
        """
        Initialize MergeAgent

        Args:
            diff_engine: Diff engine
            llm_provider: LLM provider (optional)
        """
        self.diff_engine = diff_engine
        self.llm_provider = llm_provider

    def merge(
        self,
        base_id: str,
        base_segments: List[Dict[str, str]],
        source_id: str,
        source_segments: List[Dict[str, str]],
        target_id: str,
        target_segments: List[Dict[str, str]],
        auto_resolve_conflicts: bool = False,
    ) -> MergeResult:
        """
        Execute three-way merge

        Args:
            base_id: Common ancestor version ID
            base_segments: List of segments from common ancestor
            source_id: Source Branch version ID
            source_segments: List of segments from Source Branch
            target_id: Target Branch version ID
            target_segments: List of segments from Target Branch
            auto_resolve_conflicts: Whether to use LLM to automatically resolve conflicts

        Returns:
            MergeResult
        """
        # 1. Execute three-way diff
        diff_result = self.diff_engine.diff_three_way(
            base_id=base_id,
            base_segments=base_segments,
            source_id=source_id,
            source_segments=source_segments,
            target_id=target_id,
            target_segments=target_segments,
        )

        # 2. Auto-merge
        merged_segments = []
        conflicts = []
        auto_merged_count = 0
        llm_resolved_count = 0

        # Build segment_id -> segment mapping table
        source_map = {seg["segment_id"]: seg for seg in source_segments}
        target_map = {seg["segment_id"]: seg for seg in target_segments}
        base_map = {seg["segment_id"]: seg for seg in base_segments}

        for diff in diff_result.segment_diffs:
            if diff.diff_type == DiffType.SAME:
                # Keep original text
                merged_segments.append({
                    "segment_id": diff.segment_id,
                    "text": diff.text,
                })
                auto_merged_count += 1

            elif diff.diff_type == DiffType.ADDED:
                # Add new segment
                merged_segments.append({
                    "segment_id": diff.segment_id,
                    "text": diff.text,
                })
                auto_merged_count += 1

            elif diff.diff_type == DiffType.REMOVED:
                # Delete segment (don't add to merged_segments)
                auto_merged_count += 1

            elif diff.diff_type == DiffType.MODIFIED:
                # Take modified version
                if diff.matched_segment_id:
                    merged_segments.append({
                        "segment_id": diff.matched_segment_id,
                        "text": diff.matched_text or diff.text,
                    })
                    auto_merged_count += 1

            elif diff.diff_type == DiffType.CONFLICT:
                # Record conflict
                conflicts.append(diff)

                # Try to resolve conflict using LLM
                if auto_resolve_conflicts and self.llm_provider:
                    resolved_text = self._resolve_conflict_with_llm(diff, base_map, source_map, target_map)
                    if resolved_text:
                        merged_segments.append({
                            "segment_id": diff.segment_id,
                            "text": resolved_text,
                        })
                        llm_resolved_count += 1
                    else:
                        # LLM resolution failed, keep conflict marker
                        merged_segments.append({
                            "segment_id": diff.segment_id,
                            "text": f"<<<<<<< CONFLICT\n{diff.matched_text}\n=======",
                        })
                else:
                    # Not using LLM, keep conflict marker
                    merged_segments.append({
                        "segment_id": diff.segment_id,
                        "text": f"<<<<<<< CONFLICT\n{diff.matched_text}\n=======",
                    })

        return MergeResult(
            base_id=base_id,
            source_id=source_id,
            target_id=target_id,
            merged_segments=merged_segments,
            conflicts=conflicts,
            total_segments=len(merged_segments),
            auto_merged_count=auto_merged_count,
            conflict_count=len(conflicts),
            llm_resolved_count=llm_resolved_count,
            diff_result=diff_result,
        )

    def _resolve_conflict_with_llm(
        self,
        conflict_diff: SegmentDiff,
        base_map: Dict[str, Dict[str, str]],
        source_map: Dict[str, Dict[str, str]],
        target_map: Dict[str, Dict[str, str]],
    ) -> Optional[str]:
        """
        Resolve conflict using LLM

        Args:
            conflict_diff: Conflicting SegmentDiff
            base_map: Base segment mapping table
            source_map: Source segment mapping table
            target_map: Target segment mapping table

        Returns:
            Resolved text, or None if failed
        """
        if not self.llm_provider:
            return None

        # Extract conflicting source and target segment_id
        if not conflict_diff.matched_segment_id or "|" not in conflict_diff.matched_segment_id:
            return None

        source_seg_id, target_seg_id = conflict_diff.matched_segment_id.split("|")

        # Get texts
        base_text = conflict_diff.text
        source_text = source_map.get(source_seg_id, {}).get("text", "")
        target_text = target_map.get(target_seg_id, {}).get("text", "")

        # Call LLM
        try:
            resolved = self.llm_provider.resolve_conflict(
                base_text=base_text,
                source_text=source_text,
                target_text=target_text,
                context="",
            )
            return resolved
        except Exception:
            # LLM call failed, return None
            return None
