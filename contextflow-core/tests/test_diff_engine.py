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

        # Verify exact counts
        assert result.added_count == 1, f"Expected added_count == 1, got {result.added_count}"
        assert result.total_segments == 2, f"Expected total_segments == 2, got {result.total_segments}"

        # Verify the added segment is target-s2 (remember me)
        added_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.ADDED]
        assert len(added_diffs) == 1, f"Expected 1 added diff, got {len(added_diffs)}"
        assert added_diffs[0].segment_id == "target-s2", f"Expected target-s2 added, got {added_diffs[0].segment_id}"
        assert "记住我" in added_diffs[0].text, f"Expected 记住我 in added text, got {added_diffs[0].text}"

    def test_removed_segments(self, diff_engine):
        """Test recognition of removed segments"""
        # Use very different texts to ensure removed segment is detected
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "base-s2", "text": "系统需要支持PDF文件导出和打印功能."},
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

        # Verify exact counts and segment content
        assert result.removed_count == 1, f"Expected removed_count == 1, got {result.removed_count}"
        assert result.total_segments == 2, f"Expected total_segments == 2, got {result.total_segments}"

        # Verify the removed segment is base-s2 (PDF export)
        removed_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.REMOVED]
        assert len(removed_diffs) == 1, f"Expected 1 removed diff, got {len(removed_diffs)}"
        assert removed_diffs[0].segment_id == "base-s2", f"Expected base-s2 removed, got {removed_diffs[0].segment_id}"
        assert "PDF" in removed_diffs[0].text, f"Expected PDF in removed text, got {removed_diffs[0].text}"

        # Verify base-s1 is matched (SAME or MODIFIED)
        matched_diffs = [d for d in result.segment_diffs if d.diff_type in (DiffType.SAME, DiffType.MODIFIED)]
        assert len(matched_diffs) == 1, f"Expected 1 matched diff, got {len(matched_diffs)}"
        assert matched_diffs[0].segment_id == "base-s1"

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

        # Verify no conflicts and correct counts
        assert result.conflict_count == 0, f"Expected no conflicts, got {result.conflict_count}"
        assert result.added_count == 2, f"Expected 2 added segments, got {result.added_count}"
        assert result.same_count == 1, f"Expected 1 same segment, got {result.same_count}"

        # Verify added segments are source-s2 and target-s3
        added_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.ADDED]
        added_ids = {d.segment_id for d in added_diffs}
        assert "source-s2" in added_ids, f"Expected source-s2 in added, got {added_ids}"
        assert "target-s3" in added_ids, f"Expected target-s3 in added, got {added_ids}"

        # Verify base-s1 is kept as SAME
        same_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.SAME]
        assert len(same_diffs) == 1
        assert same_diffs[0].segment_id == "base-s1"

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

        # Verify exact conflict count
        assert result.conflict_count == 1, f"Expected 1 conflict, got {result.conflict_count}"
        assert result.total_segments == 1, f"Expected 1 total segment, got {result.total_segments}"

        # Check conflict details
        conflicts = [d for d in result.segment_diffs if d.diff_type == DiffType.CONFLICT]
        assert len(conflicts) == 1, f"Expected 1 conflict diff, got {len(conflicts)}"
        assert conflicts[0].segment_id == "base-s1", f"Expected base-s1 in conflict, got {conflicts[0].segment_id}"
        assert "|" in conflicts[0].matched_segment_id, f"Expected | in matched_segment_id, got {conflicts[0].matched_segment_id}"

        # Verify conflict contains both source and target references
        assert "source-s1" in conflicts[0].matched_segment_id
        assert "target-s1" in conflicts[0].matched_segment_id

    def test_both_deleted(self, diff_engine):
        """Test both sides deleted"""
        # Use very different texts to avoid false similarity matches
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能."},
            {"segment_id": "base-s2", "text": "系统需要支持PDF文件导出和打印功能."},
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

        # Verify exact counts
        assert result.removed_count == 1, f"Expected removed_count == 1, got {result.removed_count}"
        assert result.conflict_count == 0, f"Expected no conflicts, got {result.conflict_count}"

        # Verify the removed segment is base-s2 (PDF export)
        removed_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.REMOVED]
        assert len(removed_diffs) == 1, f"Expected 1 removed diff, got {len(removed_diffs)}"
        assert removed_diffs[0].segment_id == "base-s2", f"Expected base-s2 removed, got {removed_diffs[0].segment_id}"
        assert "PDF" in removed_diffs[0].text, f"Expected PDF in removed text, got {removed_diffs[0].text}"

        # Verify base-s1 is kept (SAME) since both source and target have it
        same_diffs = [d for d in result.segment_diffs if d.diff_type == DiffType.SAME]
        assert len(same_diffs) == 1, f"Expected 1 SAME diff, got {len(same_diffs)}"
        assert same_diffs[0].segment_id == "base-s1"


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
