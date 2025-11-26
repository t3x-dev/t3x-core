"""
Diff 引擎测试

测试双向 diff 和三方 diff 逻辑。
"""

import pytest

from core.diff import DiffEngine, DiffType
from core.embedding import MiniLMEmbeddingProvider


@pytest.fixture
def diff_engine():
    """初始化 Diff 引擎"""
    embedding_provider = MiniLMEmbeddingProvider()
    return DiffEngine(embedding_provider, threshold=0.70)


class TestTwoWayDiff:
    """测试双向 Diff（Draft vs Commit）"""

    def test_same_segments(self, diff_engine):
        """测试相同分句识别"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现一个登录功能。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},  # 略有不同但语义相似
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-1",
            base_segments=base_segments,
            target_id="draft-1",
            target_segments=target_segments,
        )

        # 应该识别为相同或修改（取决于相似度）
        assert result.total_segments > 0
        assert result.same_count + result.modified_count > 0

    def test_added_segments(self, diff_engine):
        """测试新增分句识别"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
            {"segment_id": "target-s2", "text": "添加记住我功能。"},  # 新增
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-2",
            base_segments=base_segments,
            target_id="draft-2",
            target_segments=target_segments,
        )

        # 应该识别出新增分句
        assert result.added_count > 0

    def test_removed_segments(self, diff_engine):
        """测试删除分句识别"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能。"},
            {"segment_id": "base-s2", "text": "需要支持邮箱登录。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-3",
            base_segments=base_segments,
            target_id="draft-3",
            target_segments=target_segments,
        )

        # 应该识别出删除分句
        assert result.removed_count > 0

    def test_modified_segments(self, diff_engine):
        """测试修改分句识别"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱、手机号和密码登录。"},  # 修改
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-4",
            base_segments=base_segments,
            target_id="draft-4",
            target_segments=target_segments,
        )

        # 应该识别为修改
        assert result.modified_count > 0 or result.same_count > 0


class TestThreeWayDiff:
    """测试三方 Diff（Merge）"""

    def test_no_conflict_merge(self, diff_engine):
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

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 无冲突，应该有 SAME 和 ADDED
        assert result.conflict_count == 0
        assert result.added_count > 0

    def test_conflict_detection(self, diff_engine):
        """测试冲突检测"""
        base_segments = [
            {"segment_id": "base-s1", "text": "需要支持邮箱和密码登录。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "需要支持邮箱、手机号和密码登录。"},  # Source 修改
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "需要支持邮箱、微信和密码登录。"},  # Target 也修改
        ]

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 应该检测出冲突
        assert result.conflict_count > 0

        # 检查冲突详情
        conflicts = [d for d in result.segment_diffs if d.diff_type == DiffType.CONFLICT]
        assert len(conflicts) > 0
        assert "|" in conflicts[0].matched_segment_id  # Source|Target 格式

    def test_both_deleted(self, diff_engine):
        """测试双方都删除"""
        base_segments = [
            {"segment_id": "base-s1", "text": "用户希望实现登录功能。"},
            {"segment_id": "base-s2", "text": "需要支持邮箱登录。"},
        ]
        source_segments = [
            {"segment_id": "source-s1", "text": "用户希望实现登录功能。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
        ]

        result = diff_engine.diff_three_way(
            base_id="commit-base",
            base_segments=base_segments,
            source_id="commit-source",
            source_segments=source_segments,
            target_id="commit-target",
            target_segments=target_segments,
        )

        # 应该识别为删除
        assert result.removed_count > 0


class TestDiffStatistics:
    """测试 Diff 统计信息"""

    def test_statistics_calculation(self, diff_engine):
        """测试统计信息自动计算"""
        base_segments = [
            {"segment_id": "base-s1", "text": "第一句。"},
            {"segment_id": "base-s2", "text": "第二句。"},
        ]
        target_segments = [
            {"segment_id": "target-s1", "text": "第一句。"},
            {"segment_id": "target-s3", "text": "第三句。"},  # 新增
        ]

        result = diff_engine.diff_two_way(
            base_id="commit-5",
            base_segments=base_segments,
            target_id="draft-5",
            target_segments=target_segments,
        )

        # 统计信息应该正确
        total = result.same_count + result.added_count + result.removed_count + result.modified_count + result.conflict_count
        assert result.total_segments == total
