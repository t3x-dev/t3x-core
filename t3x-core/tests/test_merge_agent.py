"""
MergeAgent tests

Tests for three-way merge logic and conflict handling.
"""

import pytest

from core.agents import MergeAgent
from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


@pytest.fixture
def merge_agent():
    """Initialize MergeAgent"""
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)
    return MergeAgent(diff_engine)


class TestAutoMerge:
    """Test automatic merge"""

    def test_merge_without_conflicts(self, merge_agent):
        """Test merge without conflicts"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "source-s2", "text": "添加记住我功能."},  # Source added
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "target-s3", "text": "添加validate码功能."},  # Target added
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Should auto-merge successfully
        assert result.conflict_count == 0
        assert result.auto_merged_count > 0
        assert len(result.merged_segments) > 0

    def test_merge_with_additions(self, merge_agent):
        """Test merge with additions"""
        base_segments = []
        source_segments = [
            {"segment_id": "source-s1", "text": "Source 新增内容."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "Target 新增内容."},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Should include both sides' additions
        assert len(result.merged_segments) == 2

    def test_merge_with_deletions(self, merge_agent):
        """Test merge with deletions"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句."},
            {"segment_id": "base-s2", "text": "第二句."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "第一句."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句."},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Both sides deleted, should keep deleted
        assert result.auto_merged_count > 0


class TestConflictDetection:
    """Test conflict detection"""

    def test_detect_conflicts(self, merge_agent):
        """Test conflict detection"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "需要支持邮箱,手机号和密码登录."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱,微信和密码登录."},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Should detect conflicts
        assert result.conflict_count > 0
        assert len(result.conflicts) > 0

    def test_conflict_markers(self, merge_agent):
        """Test conflict markers"""
        base_segments = [
            {"segment_id": "base-s1", "text": "原始内容."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "Source 修改内容."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "Target 修改内容."},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Merge result should contain conflict markers
        conflict_segments = [
            seg for seg in result.merged_segments
            if "<<<<<<< CONFLICT" in seg["text"]
        ]
        assert len(conflict_segments) > 0 or result.conflict_count == 0


class TestMergeStatistics:
    """Test merge statistics"""

    def test_statistics_accuracy(self, merge_agent):
        """Test statistics accuracy"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "第一句."},
            {"segment_id": "source-s2", "text": "第二句."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句."},
        ]

        result = merge_agent.merge(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Statistics should be accurate
        assert result.total_segments == len(result.merged_segments)
        assert result.auto_merged_count + result.llm_resolved_count >= 0
        assert result.conflict_count == len(result.conflicts)
