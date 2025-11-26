"""
MergeAgent 示例

演示如何使用 MergeAgent 进行三方合并。
"""

from core.agents import MergeAgent
from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


def demo_merge_without_conflicts():
    """演示无冲突合并"""
    print("=== 无冲突合并示例 ===\n")

    # 1. 准备分句数据
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能。"},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录。"},
    ]

    source_segments = [
        {"segment_id": "source-s1", "text": "用户希望实现登录功能。"},
        {"segment_id": "source-s2", "text": "需要支持邮箱和密码登录。"},
        {"segment_id": "source-s3", "text": "添加记住我功能。"},  # Source 新增
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能。"},
        {"segment_id": "target-s2", "text": "需要支持邮箱和密码登录。"},
        {"segment_id": "target-s3", "text": "添加验证码功能。"},  # Target 新增（不同）
    ]

    # 2. 初始化
    print("正在加载 MiniLM 模型...")
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)
    merge_agent = MergeAgent(diff_engine)

    # 3. 执行合并
    print("正在执行三方合并...\n")
    result = merge_agent.merge(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. 输出结果
    print(f"合并结果 ({result.source_id} + {result.target_id} ← {result.base_id})")
    print(f"总分句数: {result.total_segments}")
    print(f"自动合并: {result.auto_merged_count}")
    print(f"冲突数: {result.conflict_count}")
    print(f"LLM 解决: {result.llm_resolved_count}")

    print("\n合并后的分句:")
    for seg in result.merged_segments:
        print(f"  [{seg['segment_id']}] {seg['text']}")

    if result.conflicts:
        print("\n冲突列表:")
        for conflict in result.conflicts:
            print(f"  [{conflict.segment_id}]")
            print(f"    Base: {conflict.text}")
            print(f"    冲突: {conflict.matched_text}")


def demo_merge_with_conflicts():
    """演示有冲突合并"""
    print("\n\n=== 有冲突合并示例 ===\n")

    # 1. 准备分句数据（制造冲突）
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
    merge_agent = MergeAgent(diff_engine)

    # 3. 执行合并
    print("正在执行三方合并...\n")
    result = merge_agent.merge(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. 输出结果
    print(f"合并结果 ({result.source_id} + {result.target_id} ← {result.base_id})")
    print(f"总分句数: {result.total_segments}")
    print(f"自动合并: {result.auto_merged_count}")
    print(f"冲突数: {result.conflict_count}")
    print(f"LLM 解决: {result.llm_resolved_count}")

    print("\n合并后的分句:")
    for seg in result.merged_segments:
        print(f"  [{seg['segment_id']}] {seg['text']}")

    if result.conflicts:
        print("\n冲突详情:")
        for conflict in result.conflicts:
            print(f"\n  [{conflict.segment_id}]")
            print(f"    Base: {conflict.text}")
            print(f"    冲突内容:\n{conflict.matched_text}")


if __name__ == "__main__":
    # 运行无冲突合并示例
    demo_merge_without_conflicts()

    # 运行有冲突合并示例
    demo_merge_with_conflicts()
