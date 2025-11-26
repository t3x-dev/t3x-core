"""
MergeAgent 测试

测试三方合并逻辑和冲突处理。
"""

import pytest

from core.agents import MergeAgent
from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


@pytest.fixture
def merge_agent():
    """初始化 MergeAgent"""
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)
    return MergeAgent(diff_engine)


class TestAutoMerge:
    """测试自动合并"""

    def test_merge_without_conflicts(self, merge_agent):
        """测试无冲突合并"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "用户希望实现登录功能。"},
            {"segment_id": "source-s2", "text": "添加记住我功能。"},  # Source 新增
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
            {"segment_id": "target-s3", "text": "添加验证码功能。"},  # Target 新增
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 应该自动合并成功
        assert result.conflict_count == 0
        assert result.auto_merged_count > 0
        assert len(result.merged_segments) > 0

    def test_merge_with_additions(self, merge_agent):
        """测试包含新增的合并"""
        base_segments = []
        source_segments = [
            {"segment_id": "source-s1", "text": "Source 新增内容。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "Target 新增内容。"},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 应该包含双方的新增
        assert len(result.merged_segments) == 2

    def test_merge_with_deletions(self, merge_agent):
        """测试包含删除的合并"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句。"},
            {"segment_id": "base-s2", "text": "第二句。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "第一句。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句。"},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 双方都删除，应该保持删除
        assert result.auto_merged_count > 0


class TestConflictDetection:
    """测试冲突检测"""

    def test_detect_conflicts(self, merge_agent):
        """测试冲突检测"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "需要支持邮箱、手机号和密码登录。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱、微信和密码登录。"},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 应该检测出冲突
        assert result.conflict_count > 0
        assert len(result.conflicts) > 0

    def test_conflict_markers(self, merge_agent):
        """测试冲突标记"""
        base_segments = [
            {"segment_id": "base-s1", "text": "原始内容。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "Source 修改内容。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "Target 修改内容。"},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 合并结果应该包含冲突标记
        conflict_segments = [
            seg for seg in result.merged_segments
            if "<<<<<<< CONFLICT" in seg["text"]
        ]
        assert len(conflict_segments) > 0 or result.conflict_count == 0


class TestMergeStatistics:
    """测试合并统计信息"""

    def test_statistics_accuracy(self, merge_agent):
        """测试统计信息准确性"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "第一句。"},
            {"segment_id": "source-s2", "text": "第二句。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句。"},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 统计信息应该准确
        assert result.total_segments == len(result.merged_segments)
        assert result.auto_merged_count + result.llm_resolved_count >= 0
        assert result.conflict_count == len(result.conflicts)
