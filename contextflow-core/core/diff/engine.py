"""
三方语义 Diff 引擎实现

按照 docs/ARCHITECTURE.zh.md:124-141 的算法：
1. 取参考版本 A 的每个分句 sA_i，编码向量 emb(sA_i)
2. 取目标版本 B 的全文（或聚合分句矩阵）编码 Emb(B)
3. 计算 cosine(emb(sA_i), Emb(B))，高于阈值视为"相同"，否则为"不同/新增"
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Protocol

from .types import DiffType, SegmentDiff, SegmentMatch


# Protocol for Embedding Provider
class EmbeddingProvider(Protocol):
    """
    嵌入提供者接口

    Draft Workflow 和 Diff Engine 共用此接口。
    """

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        编码文本为向量

        Args:
            texts: 文本列表

        Returns:
            向量列表
        """
        ...

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        计算两个向量的余弦相似度

        Args:
            vec_a: 向量 A
            vec_b: 向量 B

        Returns:
            相似度分数（0~1）
        """
        ...


@dataclass
class DiffResult:
    """
    Diff 结果

    包含所有分句的 Diff 信息。
    """

    base_id: str  # 基准版本 ID（Commit Hash 或 "draft"）
    target_id: str  # 目标版本 ID
    segment_diffs: List[SegmentDiff]
    threshold: float  # 使用的相似度阈值

    # 三方 diff 专用字段
    source_id: Optional[str] = None  # Source Branch 版本 ID（仅三方 diff）

    # 统计信息
    total_segments: int = 0
    same_count: int = 0
    added_count: int = 0
    removed_count: int = 0
    modified_count: int = 0
    conflict_count: int = 0

    def __post_init__(self):
        # 自动计算统计信息
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
    三方语义 Diff 引擎

    支持两种场景：
    1. Commit Diff（Draft 自检）
    2. Merge Diff（预览）
    """

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        threshold: float = 0.70,
    ):
        """
        初始化 Diff 引擎

        Args:
            embedding_provider: 嵌入提供者
            threshold: 相似度阈值（默认 0.70）
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
        双向 Diff（Commit Diff / Draft 自检）

        场景：将当前 Draft（版本 A）与父 Commit（版本 B）做语义 diff。

        Args:
            base_id: 基准版本 ID
            base_segments: 基准版本的分句列表
            target_id: 目标版本 ID
            target_segments: 目标版本的分句列表

        Returns:
            DiffResult
        """
        # 1. 编码所有分句
        base_texts = [seg["text"] for seg in base_segments]
        target_texts = [seg["text"] for seg in target_segments]

        base_vecs = self.embedding_provider.encode(base_texts)
        target_vecs = self.embedding_provider.encode(target_texts)

        # 2. 计算相似度矩阵
        matches = self._compute_matches(
            base_segments, base_vecs,
            target_segments, target_vecs,
        )

        # 3. 生成 Diff 结果
        segment_diffs = []
        target_matched_ids = set()

        # 检查 base 中的每个分句
        for base_seg in base_segments:
            best_match = matches.get(base_seg["segment_id"])

            if best_match and best_match.matched:
                # 找到匹配
                target_matched_ids.add(best_match.target_segment_id)

                # 获取匹配的 target 文本
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
                # 未找到匹配，视为删除
                segment_diffs.append(SegmentDiff(
                    segment_id=base_seg["segment_id"],
                    text=base_seg["text"],
                    diff_type=DiffType.REMOVED,
                ))

        # 检查 target 中未匹配的分句（新增）
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
        计算相似度矩阵，找到每个 base 分句的最佳匹配

        Returns:
            {base_segment_id: SegmentMatch}
        """
        matches = {}

        for i, base_seg in enumerate(base_segments):
            base_vec = base_vecs[i]
            best_similarity = 0.0
            best_target_idx = -1

            # 遍历所有 target 分句，找到最高相似度
            for j, target_seg in enumerate(target_segments):
                target_vec = target_vecs[j]
                similarity = self.embedding_provider.similarity(base_vec, target_vec)

                if similarity > best_similarity:
                    best_similarity = similarity
                    best_target_idx = j

            # 记录最佳匹配
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
        三方 Diff（Merge 预览）

        场景：合并 Source Branch 到 Target Branch，基于共同祖先 Base。

        算法：
        1. 对每个 base 分句 b_i：
           - 在 source 中找最佳匹配 s_j（相似度 sim_s）
           - 在 target 中找最佳匹配 t_k（相似度 sim_t）
        2. 分类：
           - 若 sim_s >= threshold 且 sim_t >= threshold：
             * 若 s_j == t_k（文本相同）→ SAME
             * 若 s_j != t_k → CONFLICT
           - 若 sim_s >= threshold 且 sim_t < threshold → source 保留，target 删除 → 取 source
           - 若 sim_s < threshold 且 sim_t >= threshold → source 删除，target 保留 → 取 target
           - 若 sim_s < threshold 且 sim_t < threshold → 双方都删除 → REMOVED
        3. 检查 source/target 中未匹配的分句 → ADDED

        Args:
            base_id: 共同祖先版本 ID
            base_segments: 共同祖先的分句列表
            source_id: Source Branch 版本 ID
            source_segments: Source Branch 的分句列表
            target_id: Target Branch 版本 ID
            target_segments: Target Branch 的分句列表

        Returns:
            DiffResult（包含冲突检测）
        """
        # 1. 编码所有分句
        base_texts = [seg["text"] for seg in base_segments]
        source_texts = [seg["text"] for seg in source_segments]
        target_texts = [seg["text"] for seg in target_segments]

        base_vecs = self.embedding_provider.encode(base_texts)
        source_vecs = self.embedding_provider.encode(source_texts)
        target_vecs = self.embedding_provider.encode(target_texts)

        # 2. 计算相似度矩阵
        base_to_source = self._compute_matches(base_segments, base_vecs, source_segments, source_vecs)
        base_to_target = self._compute_matches(base_segments, base_vecs, target_segments, target_vecs)

        # 3. 生成三方 Diff 结果
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
                # 双方都保留
                source_matched_ids.add(source_match.target_segment_id)
                target_matched_ids.add(target_match.target_segment_id)

                # 检查是否冲突
                source_text = self._get_segment_text(source_match.target_segment_id, source_segments)
                target_text = self._get_segment_text(target_match.target_segment_id, target_segments)

                if source_text == target_text:
                    # 内容相同 → SAME
                    segment_diffs.append(SegmentDiff(
                        segment_id=base_id_str,
                        text=base_seg["text"],
                        diff_type=DiffType.SAME,
                        similarity=max(source_match.similarity, target_match.similarity),
                        matched_segment_id=source_match.target_segment_id,
                        matched_text=source_text,
                    ))
                else:
                    # 内容不同 → CONFLICT
                    segment_diffs.append(SegmentDiff(
                        segment_id=base_id_str,
                        text=base_seg["text"],
                        diff_type=DiffType.CONFLICT,
                        similarity=(source_match.similarity + target_match.similarity) / 2,
                        matched_segment_id=f"{source_match.target_segment_id}|{target_match.target_segment_id}",
                        matched_text=f"SOURCE: {source_text}\nTARGET: {target_text}",
                    ))

            elif source_matched and not target_matched:
                # Source 保留，Target 删除 → 取 source
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
                # Source 删除，Target 保留 → 取 target
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
                # 双方都删除 → REMOVED
                segment_diffs.append(SegmentDiff(
                    segment_id=base_id_str,
                    text=base_seg["text"],
                    diff_type=DiffType.REMOVED,
                ))

        # 4. 检查 source/target 中未匹配的分句（新增）
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
            base_id=base_id,  # 共同祖先
            target_id=target_id,  # Target Branch 版本
            source_id=source_id,  # Source Branch 版本
            segment_diffs=segment_diffs,
            threshold=self.threshold,
        )

    def _get_segment_text(self, segment_id: str, segments: List[Dict[str, str]]) -> str:
        """获取指定 segment_id 的文本"""
        for seg in segments:
            if seg["segment_id"] == segment_id:
                return seg["text"]
        return ""
