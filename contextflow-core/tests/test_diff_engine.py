"""
Diff engine tests

Tests for two-way diff and three-way diff logic.
"""

import pytest

from core.diff import DiffEngine, DiffType
from core.embedding import MiniLMEmbeddingProvider


@pytest.fixture
def diff_engine():
    """Initialize Diff engine"""
    embedding_provider = MiniLMEmbeddingProvider()
    return DiffEngine(embedding_provider, threshold=0.70)


class TestTwoWayDiff:
    """Test two-way Diff (Draft vs Commit)"""

    def test_same_segments(self, diff_engine):
        """Test recognition of identical segments"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现一个登录功能."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能."},  # Slightly different but semantically similar
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-1",
            base_segments=base_segments,
            target_id="draft-1",
            target_segments=target_segments,
        )

        # Should be recognized as same or modified (depending on similarity)
        assert result.total_segments > 0
        assert result.same_count + result.modified_count > 0

    def test_added_segments(self, diff_engine):
        """Test recognition of added segments"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "target-s2", "text": "添加记住我功能."},  # Added
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-2",
            base_segments=base_segments,
            target_id="draft-2",
            target_segments=target_segments,
        )

        # Should recognize added segments
        assert result.added_count > 0

    def test_removed_segments(self, diff_engine):
        """Test recognition of removed segments"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "base-s2", "text": "需要支持邮箱登录."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-3",
            base_segments=base_segments,
            target_id="draft-3",
            target_segments=target_segments,
        )

        # Should recognize removed segments
        assert result.removed_count > 0

    def test_modified_segments(self, diff_engine):
        """Test recognition of modified segments"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱,手机号和密码登录."},  # Modified
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-4",
            base_segments=base_segments,
            target_id="draft-4",
            target_segments=target_segments,
        )

        # Should recognize as modified
        assert result.modified_count > 0 or result.same_count > 0


class TestThreeWayDiff:
    """Test three-way Diff (Merge)"""

    def test_no_conflict_merge(self, diff_engine):
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

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # No conflicts, should have SAME and ADDED
        assert result.conflict_count == 0
        assert result.added_count > 0

    def test_conflict_detection(self, diff_engine):
        """Test conflict detection"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "需要支持邮箱,手机号和密码登录."},  # Source modified
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱,微信和密码登录."},  # Target also modified
        ]

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Should detect conflicts
        assert result.conflict_count > 0

        # Check conflict details
        conflicts = [d for d in result.segment_diffs if d.diff_type == DiffType.CONFLICT]
        assert len(conflicts) > 0
        assert "|" in conflicts[0].matched_segment_id  # Source|Target format

    def test_both_deleted(self, diff_engine):
        """Test both sides deleted"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "base-s2", "text": "需要支持邮箱登录."},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "用户希望实现登录功能."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
        ]

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # Should recognize as deleted
        assert result.removed_count > 0


class TestDiffStatistics:
    """Test Diff statistics"""

    def test_statistics_calculation(self, diff_engine):
        """Test automatic statistics calculation"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句."},
            {"segment_id": "base-s2", "text": "第二句."},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句."},
            {"segment_id": "target-s3", "text": "第三句."},  # Added
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-5",
            base_segments=base_segments,
            target_id="draft-5",
            target_segments=target_segments,
        )

        # Statistics should be correct
        total = result.same_count + result.added_count + result.removed_count + result.modified_count + result.conflict_count
        assert result.total_segments == total
