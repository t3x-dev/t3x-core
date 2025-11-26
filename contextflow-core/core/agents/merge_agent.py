"""
MergeAgent 实现

按照 ARCHITECTURE.zh.md:257-277 规范：
- 基于 DiffEngine 的三方 diff
- 检测冲突（DiffType.CONFLICT）
- 自动合并无冲突部分
- 可选：LLM 辅助冲突解决（Agentic Layer）
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Protocol

from ..diff import DiffEngine, DiffResult, DiffType, SegmentDiff


# Protocol for LLM Provider (optional)
class LLMProvider(Protocol):
    """
    LLM 提供者接口

    用于辅助冲突解决（可选）。
    """

    def resolve_conflict(
        self,
        base_text: str,
        source_text: str,
        target_text: str,
        context: str = "",
    ) -> str:
        """
        使用 LLM 解决冲突

        Args:
            base_text: 共同祖先文本
            source_text: Source 分支文本
            target_text: Target 分支文本
            context: 额外上下文信息

        Returns:
            解决后的文本
        """
        ...


@dataclass
class MergeResult:
    """
    Merge 结果

    包含合并后的分句、冲突信息、统计数据。
    """

    base_id: str
    source_id: str
    target_id: str

    # 合并结果
    merged_segments: List[Dict[str, str]]  # [{"segment_id": "...", "text": "..."}]

    # 冲突信息
    conflicts: List[SegmentDiff]  # DiffType.CONFLICT 的分句

    # 统计信息
    total_segments: int = 0
    auto_merged_count: int = 0  # 自动合并成功的分句数
    conflict_count: int = 0  # 冲突分句数
    llm_resolved_count: int = 0  # LLM 解决的冲突数

    # Diff 结果（用于审计）
    diff_result: Optional[DiffResult] = None


class MergeAgent:
    """
    三方合并代理

    工作流程：
    1. 使用 DiffEngine 进行三方 diff
    2. 自动合并无冲突部分：
       - SAME → 保留
       - ADDED → 添加
       - REMOVED → 删除
       - MODIFIED → 取修改后的版本
    3. 收集冲突（CONFLICT）
    4. 可选：使用 LLM 辅助解决冲突
    """

    def __init__(
        self,
        diff_engine: DiffEngine,
        llm_provider: Optional[LLMProvider] = None,
    ):
        """
        初始化 MergeAgent

        Args:
            diff_engine: Diff 引擎
            llm_provider: LLM 提供者（可选）
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
        执行三方合并

        Args:
            base_id: 共同祖先版本 ID
            base_segments: 共同祖先的分句列表
            source_id: Source Branch 版本 ID
            source_segments: Source Branch 的分句列表
            target_id: Target Branch 版本 ID
            target_segments: Target Branch 的分句列表
            auto_resolve_conflicts: 是否使用 LLM 自动解决冲突

        Returns:
            MergeResult
        """
        # 1. 执行三方 diff
        diff_result = self.diff_engine.diff_three_way(
            base_id=base_id,
            base_segments=base_segments,
            source_id=source_id,
            source_segments=source_segments,
            target_id=target_id,
            target_segments=target_segments,
        )

        # 2. 自动合并
        merged_segments = []
        conflicts = []
        auto_merged_count = 0
        llm_resolved_count = 0

        # 构建 segment_id -> segment 映射表
        source_map = {seg["segment_id"]: seg for seg in source_segments}
        target_map = {seg["segment_id"]: seg for seg in target_segments}
        base_map = {seg["segment_id"]: seg for seg in base_segments}

        for diff in diff_result.segment_diffs:
            if diff.diff_type == DiffType.SAME:
                # 保留原文本
                merged_segments.append({
                    "segment_id": diff.segment_id,
                    "text": diff.text,
                })
                auto_merged_count += 1

            elif diff.diff_type == DiffType.ADDED:
                # 添加新分句
                merged_segments.append({
                    "segment_id": diff.segment_id,
                    "text": diff.text,
                })
                auto_merged_count += 1

            elif diff.diff_type == DiffType.REMOVED:
                # 删除分句（不添加到 merged_segments）
                auto_merged_count += 1

            elif diff.diff_type == DiffType.MODIFIED:
                # 取修改后的版本
                if diff.matched_segment_id:
                    merged_segments.append({
                        "segment_id": diff.matched_segment_id,
                        "text": diff.matched_text or diff.text,
                    })
                    auto_merged_count += 1

            elif diff.diff_type == DiffType.CONFLICT:
                # 记录冲突
                conflicts.append(diff)

                # 尝试使用 LLM 解决冲突
                if auto_resolve_conflicts and self.llm_provider:
                    resolved_text = self._resolve_conflict_with_llm(diff, base_map, source_map, target_map)
                    if resolved_text:
                        merged_segments.append({
                            "segment_id": diff.segment_id,
                            "text": resolved_text,
                        })
                        llm_resolved_count += 1
                    else:
                        # LLM 解决失败，保留冲突标记
                        merged_segments.append({
                            "segment_id": diff.segment_id,
                            "text": f"<<<<<<< CONFLICT\n{diff.matched_text}\n=======",
                        })
                else:
                    # 不使用 LLM，保留冲突标记
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
        使用 LLM 解决冲突

        Args:
            conflict_diff: 冲突的 SegmentDiff
            base_map: base segment 映射表
            source_map: source segment 映射表
            target_map: target segment 映射表

        Returns:
            解决后的文本，失败返回 None
        """
        if not self.llm_provider:
            return None

        # 提取冲突的 source 和 target segment_id
        if not conflict_diff.matched_segment_id or "|" not in conflict_diff.matched_segment_id:
            return None

        source_seg_id, target_seg_id = conflict_diff.matched_segment_id.split("|")

        # 获取文本
        base_text = conflict_diff.text
        source_text = source_map.get(source_seg_id, {}).get("text", "")
        target_text = target_map.get(target_seg_id, {}).get("text", "")

        # 调用 LLM
        try:
            resolved = self.llm_provider.resolve_conflict(
                base_text=base_text,
                source_text=source_text,
                target_text=target_text,
                context="",
            )
            return resolved
        except Exception:
            # LLM 调用失败，返回 None
            return None
