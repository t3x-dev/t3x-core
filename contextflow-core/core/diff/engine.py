"""
Three-way semantic Diff engine implementation

Following the algorithm from docs/ARCHITECTURE.zh.md:124-141:
1. Take each sentence sA_i from reference version A, encode vector emb(sA_i)
2. Take the full text of target version B (or aggregated sentence matrix) and encode Emb(B)
3. Calculate cosine(emb(sA_i), Emb(B)), if above threshold treat as "same", otherwise as "different/added"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Protocol

from .types import DiffType, SegmentDiff, SegmentMatch


# Protocol for Embedding Provider
class EmbeddingProvider(Protocol):
    """
    Embedding provider interface

    Shared by Draft Workflow and Diff Engine.
    """

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        Encode texts to vectors

        Args:
            texts: List of texts

        Returns:
            List of vectors
        """
        ...

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors

        Args:
            vec_a: Vector A
            vec_b: Vector B

        Returns:
            Similarity score (0~1)
        """
        ...


@dataclass
class DiffResult:
    """
    Diff result

    Contains Diff information for all segments.
    """

    base_id: str  # Base version ID (Commit Hash or "draft")
    target_id: str  # Target version ID
    segment_diffs: List[SegmentDiff]
    threshold: float  # Similarity threshold used

    # Three-way diff specific fields
    source_id: Optional[str] = None  # Source Branch version ID (three-way diff only)

    # Statistics
    total_segments: int = 0
    same_count: int = 0
    added_count: int = 0
    removed_count: int = 0
    modified_count: int = 0
    conflict_count: int = 0

    def __post_init__(self):
        # Automatically calculate statistics
        self.total_segments = len(self.segment_diffs)
        for diff in self.segment_diffs:
            if diff.diff_type == DiffType.SAME:
                self.same_count += 1
            elif diff.diff_type == DiffType.ADDED:
                self.added_count += 1
            elif diff.diff_type == DiffType.REMOVED:
                self.removed_count += 1
            elif diff.diff_type == DiffType.MODIFIED:
                self.modified_count += 1
            elif diff.diff_type == DiffType.CONFLICT:
                self.conflict_count += 1


class DiffEngine:
    """
    Three-way semantic Diff engine

    Supports two scenarios:
    1. Commit Diff (Draft self-check)
    2. Merge Diff (preview)
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        threshold: float = 0.70,
    ):
        """
        Initialize Diff engine

        Args:
            embedding_provider: Embedding provider
            threshold: Similarity threshold (default 0.70)
        """
        self.embedding_provider = embedding_provider
        self.threshold = threshold

    def diff_two_way(
        self,
        base_id: str,
        base_segments: List[Dict[str, str]],  # [{"segment_id": "s-1", "text": "..."}]
        target_id: str,
        target_segments: List[Dict[str, str]],
    ) -> DiffResult:
        """
        Two-way Diff (Commit Diff / Draft self-check)

        Scenario: Perform semantic diff between current Draft (version A) and parent Commit (version B).

        Args:
            base_id: Base version ID
            base_segments: List of segments from base version
            target_id: Target version ID
            target_segments: List of segments from target version

        Returns:
            DiffResult
        """
        # 1. Encode all segments
        base_texts = [seg["text"] for seg in base_segments]
        target_texts = [seg["text"] for seg in target_segments]

        base_vecs = self.embedding_provider.encode(base_texts)
        target_vecs = self.embedding_provider.encode(target_texts)

        # 2. Calculate similarity matrix
        matches = self._compute_matches(
            base_segments, base_vecs,
            target_segments, target_vecs,
        )

        # 3. Generate Diff result
        segment_diffs = []
        target_matched_ids = set()

        # Check each segment in base
        for base_seg in base_segments:
            best_match = matches.get(base_seg["segment_id"])

            if best_match and best_match.matched:
                # Found match
                target_matched_ids.add(best_match.target_segment_id)

                # Get matched target text
                matched_text = None
                for t_seg in target_segments:
                    if t_seg["segment_id"] == best_match.target_segment_id:
                        matched_text = t_seg["text"]
                        break

                diff_type = DiffType.SAME if best_match.similarity >= self.threshold else DiffType.MODIFIED
                segment_diffs.append(SegmentDiff(
                    segment_id=base_seg["segment_id"],
                    text=base_seg["text"],
                    diff_type=diff_type,
                    similarity=best_match.similarity,
                    matched_segment_id=best_match.target_segment_id,
                    matched_text=matched_text,
                ))
            else:
                # No match found, treat as removed
                segment_diffs.append(SegmentDiff(
                    segment_id=base_seg["segment_id"],
                    text=base_seg["text"],
                    diff_type=DiffType.REMOVED,
                ))

        # Check unmatched segments in target (added)
        for target_seg in target_segments:
            if target_seg["segment_id"] not in target_matched_ids:
                segment_diffs.append(SegmentDiff(
                    segment_id=target_seg["segment_id"],
                    text=target_seg["text"],
                    diff_type=DiffType.ADDED,
                ))

        return DiffResult(
            base_id=base_id,
            target_id=target_id,
            segment_diffs=segment_diffs,
            threshold=self.threshold,
        )

    def _compute_matches(
        self,
        base_segments: List[Dict[str, str]],
        base_vecs: List[List[float]],
        target_segments: List[Dict[str, str]],
        target_vecs: List[List[float]],
    ) -> Dict[str, SegmentMatch]:
        """
        Calculate similarity matrix and find best match for each base segment

        Returns:
            {base_segment_id: SegmentMatch}
        """
        matches = {}

        for i, base_seg in enumerate(base_segments):
            base_vec = base_vecs[i]
            best_similarity = 0.0
            best_target_idx = -1

            # Iterate through all target segments to find highest similarity
            for j, target_seg in enumerate(target_segments):
                target_vec = target_vecs[j]
                similarity = self.embedding_provider.similarity(base_vec, target_vec)

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_target_idx = j

            # Record best match
            if best_target_idx >= 0:
                matches[base_seg["segment_id"]] = SegmentMatch(
                    source_segment_id=base_seg["segment_id"],
                    target_segment_id=target_segments[best_target_idx]["segment_id"],
                    similarity=best_similarity,
                    matched=best_similarity >= self.threshold,
                )

        return matches

    def diff_three_way(
        self,
        base_id: str,
        base_segments: List[Dict[str, str]],
        source_id: str,
        source_segments: List[Dict[str, str]],
        target_id: str,
        target_segments: List[Dict[str, str]],
    ) -> DiffResult:
        """
        Three-way Diff (Merge preview)

        Scenario: Merge Source Branch to Target Branch based on common ancestor Base.

        Algorithm:
        1. For each base segment b_i:
           - Find best match s_j in source (similarity sim_s)
           - Find best match t_k in target (similarity sim_t)
        2. Classify:
           - If sim_s >= threshold and sim_t >= threshold:
             * If s_j == t_k (same text) → SAME
             * If s_j != t_k → CONFLICT
           - If sim_s >= threshold and sim_t < threshold → source kept, target deleted → take source
           - If sim_s < threshold and sim_t >= threshold → source deleted, target kept → take target
           - If sim_s < threshold and sim_t < threshold → both deleted → REMOVED
        3. Check unmatched segments in source/target → ADDED

        Args:
            base_id: Common ancestor version ID
            base_segments: List of segments from common ancestor
            source_id: Source Branch version ID
            source_segments: List of segments from Source Branch
            target_id: Target Branch version ID
            target_segments: List of segments from Target Branch

        Returns:
            DiffResult (includes conflict detection)
        """
        # 1. Encode all segments
        base_texts = [seg["text"] for seg in base_segments]
        source_texts = [seg["text"] for seg in source_segments]
        target_texts = [seg["text"] for seg in target_segments]

        base_vecs = self.embedding_provider.encode(base_texts)
        source_vecs = self.embedding_provider.encode(source_texts)
        target_vecs = self.embedding_provider.encode(target_texts)

        # 2. Calculate similarity matrices
        base_to_source = self._compute_matches(base_segments, base_vecs, source_segments, source_vecs)
        base_to_target = self._compute_matches(base_segments, base_vecs, target_segments, target_vecs)

        # 3. Generate three-way Diff result
        segment_diffs = []
        source_matched_ids = set()
        target_matched_ids = set()

        for base_seg in base_segments:
            base_id_str = base_seg["segment_id"]
            source_match = base_to_source.get(base_id_str)
            target_match = base_to_target.get(base_id_str)

            source_matched = source_match and source_match.matched
            target_matched = target_match and target_match.matched

            if source_matched and target_matched:
                # Both sides kept
                source_matched_ids.add(source_match.target_segment_id)
                target_matched_ids.add(target_match.target_segment_id)

                # Check for conflict
                source_text = self._get_segment_text(source_match.target_segment_id, source_segments)
                target_text = self._get_segment_text(target_match.target_segment_id, target_segments)

                if source_text == target_text:
                    # Same content → SAME
                    segment_diffs.append(SegmentDiff(
                        segment_id=base_id_str,
                        text=base_seg["text"],
                        diff_type=DiffType.SAME,
                        similarity=max(source_match.similarity, target_match.similarity),
                        matched_segment_id=source_match.target_segment_id,
                        matched_text=source_text,
                    ))
                else:
                    # Different content → CONFLICT
                    segment_diffs.append(SegmentDiff(
                        segment_id=base_id_str,
                        text=base_seg["text"],
                        diff_type=DiffType.CONFLICT,
                        similarity=(source_match.similarity + target_match.similarity) / 2,
                        matched_segment_id=f"{source_match.target_segment_id}|{target_match.target_segment_id}",
                        matched_text=f"SOURCE: {source_text}\nTARGET: {target_text}",
                    ))

            elif source_matched and not target_matched:
                # Source kept, Target deleted → take source
                source_matched_ids.add(source_match.target_segment_id)
                segment_diffs.append(SegmentDiff(
                    segment_id=base_id_str,
                    text=base_seg["text"],
                    diff_type=DiffType.MODIFIED,
                    similarity=source_match.similarity,
                    matched_segment_id=source_match.target_segment_id,
                    matched_text=self._get_segment_text(source_match.target_segment_id, source_segments),
                ))

            elif not source_matched and target_matched:
                # Source deleted, Target kept → take target
                target_matched_ids.add(target_match.target_segment_id)
                segment_diffs.append(SegmentDiff(
                    segment_id=base_id_str,
                    text=base_seg["text"],
                    diff_type=DiffType.MODIFIED,
                    similarity=target_match.similarity,
                    matched_segment_id=target_match.target_segment_id,
                    matched_text=self._get_segment_text(target_match.target_segment_id, target_segments),
                ))

            else:
                # Both deleted → REMOVED
                segment_diffs.append(SegmentDiff(
                    segment_id=base_id_str,
                    text=base_seg["text"],
                    diff_type=DiffType.REMOVED,
                ))

        # 4. Check unmatched segments in source/target (added)
        for source_seg in source_segments:
            if source_seg["segment_id"] not in source_matched_ids:
                segment_diffs.append(SegmentDiff(
                    segment_id=source_seg["segment_id"],
                    text=source_seg["text"],
                    diff_type=DiffType.ADDED,
                ))

        for target_seg in target_segments:
            if target_seg["segment_id"] not in target_matched_ids:
                segment_diffs.append(SegmentDiff(
                    segment_id=target_seg["segment_id"],
                    text=target_seg["text"],
                    diff_type=DiffType.ADDED,
                ))

        return DiffResult(
            base_id=base_id,  # Common ancestor
            target_id=target_id,  # Target Branch version
            source_id=source_id,  # Source Branch version
            segment_diffs=segment_diffs,
            threshold=self.threshold,
        )

    def _get_segment_text(self, segment_id: str, segments: List[Dict[str, str]]) -> str:
        """Get text for specified segment_id"""
        for seg in segments:
            if seg["segment_id"] == segment_id:
                return seg["text"]
        return ""
