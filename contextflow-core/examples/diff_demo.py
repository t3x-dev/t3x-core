"""
三方语义 Diff 引擎示例

演示如何使用 DiffEngine 进行语义 diff。
"""

from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


def demo_two_way_diff():
    """演示双向 Diff（Draft vs Commit）"""
    print("=== 双向 Diff 示例 ===\n")

    # 1. 准备分句数据
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能。"},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录。"},
        {"segment_id": "base-s3", "text": "登录失败时显示错误提示。"},
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},  # 相似但略有不同
        {"segment_id": "target-s2", "text": "需要支持邮箱、手机号和密码登录。"},  # 修改
        {"segment_id": "target-s3", "text": "添加记住我功能。"},  # 新增
    ]

    # 2. 初始化嵌入提供者
    print("正在加载 MiniLM 模型...")
    embedding_provider = MiniLMEmbeddingProvider()

    # 3. 初始化 DiffEngine
    diff_engine = DiffEngine(
        embedding_provider=embedding_provider,
        threshold=0.70,
    )

    # 4. 执行双向 Diff
    print("正在计算语义 diff...\n")
    result = diff_engine.diff_two_way(
        base_id="commit-abc123",
        base_segments=base_segments,
        target_id="draft-xyz789",
        target_segments=target_segments,
    )

    # 5. 输出结果
    print(f"Diff 结果 ({result.base_id} → {result.target_id})")
    print(f"阈值: {result.threshold}")
    print(f"总分句数: {result.total_segments}")
    print(f"  - 相同: {result.same_count}")
    print(f"  - 新增: {result.added_count}")
    print(f"  - 删除: {result.removed_count}")
    print(f"  - 修改: {result.modified_count}")
    print(f"  - 冲突: {result.conflict_count}")
    print("\n详细 Diff:")

    for diff in result.segment_diffs:
        print(f"\n[{diff.diff_type.value.upper()}] {diff.segment_id}")
        print(f"  文本: {diff.text}")
        if diff.similarity is not None:
            print(f"  相似度: {diff.similarity:.2f}")
        if diff.matched_segment_id:
            print(f"  匹配: {diff.matched_segment_id}")
            print(f"  匹配文本: {diff.matched_text}")


def demo_three_way_diff():
    """演示三方 Diff（Merge 预览）"""
    print("\n\n=== 三方 Diff 示例 ===\n")

    # 1. 准备分句数据
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能。"},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录。"},
    ]

    source_segments = [
        {"segment_id": "source-s1", "text": "用户希望实现登录功能。"},
        {"segment_id": "source-s2", "text": "需要支持邮箱、手机号和密码登录。"},  # Source 修改
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
        {"segment_id": "target-s2", "text": "需要支持邮箱、微信和密码登录。"},  # Target 也修改（冲突）
    ]

    # 2. 初始化
    print("正在加载 MiniLM 模型...")
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)

    # 3. 执行三方 Diff
    print("正在计算三方语义 diff...\n")
    result = diff_engine.diff_three_way(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. 输出结果
    print(f"三方 Diff 结果")
    print(f"阈值: {result.threshold}")
    print(f"总分句数: {result.total_segments}")
    print(f"  - 相同: {result.same_count}")
    print(f"  - 新增: {result.added_count}")
    print(f"  - 删除: {result.removed_count}")
    print(f"  - 修改: {result.modified_count}")
    print(f"  - 冲突: {result.conflict_count}")
    print("\n详细 Diff:")

    for diff in result.segment_diffs:
        print(f"\n[{diff.diff_type.value.upper()}] {diff.segment_id}")
        print(f"  文本: {diff.text}")
        if diff.similarity is not None:
            print(f"  相似度: {diff.similarity:.2f}")
        if diff.matched_segment_id:
            print(f"  匹配: {diff.matched_segment_id}")
        if diff.matched_text:
            print(f"  匹配文本: {diff.matched_text}")


if __name__ == "__main__":
    # 运行双向 Diff 示例
    demo_two_way_diff()

    # 运行三方 Diff 示例
    demo_three_way_diff()
