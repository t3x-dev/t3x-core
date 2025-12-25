"""
MergeAgent Example

Demonstrates how to use MergeAgent for three-way merging.
"""

from core.agents import MergeAgent
from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


def demo_merge_without_conflicts():
    """Demonstrate merge without conflicts"""
    print("=== Conflict-Free Merge Example ===\n")

    # 1. Prepare segment data
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能."},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录."},
    ]

    source_segments = [
        {"segment_id": "source-s1", "text": "用户希望实现登录功能."},
        {"segment_id": "source-s2", "text": "需要支持邮箱和密码登录."},
        {"segment_id": "source-s3", "text": "添加记住我功能."},  # Source added
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
        {"segment_id": "target-s2", "text": "需要支持邮箱和密码登录."},
        {"segment_id": "target-s3", "text": "添加validate码功能."},  # Target added (different)
    ]

    # 2. Initialize
    print("Loading MiniLM model...")
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)
    merge_agent = MergeAgent(diff_engine)

    # 3. Execute merge
    print("Executing three-way merge...\n")
    result = merge_agent.merge(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. Output results
    print(f"Merge result ({result.source_id} + {result.target_id} ← {result.base_id})")
    print(f"Total segments: {result.total_segments}")
    print(f"Auto-merged: {result.auto_merged_count}")
    print(f"Conflicts: {result.conflict_count}")
    print(f"LLM resolved: {result.llm_resolved_count}")

    print("\nMerged segments:")
    for seg in result.merged_segments:
        print(f"  [{seg['segment_id']}] {seg['text']}")

    if result.conflicts:
        print("\nConflict list:")
        for conflict in result.conflicts:
            print(f"  [{conflict.segment_id}]")
            print(f"    Base: {conflict.text}")
            print(f"    Conflict: {conflict.matched_text}")


def demo_merge_with_conflicts():
    """Demonstrate merge with conflicts"""
    print("\n\n=== Merge with Conflicts Example ===\n")

    # 1. Prepare segment data (create conflicts)
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能."},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录."},
    ]

    source_segments = [
        {"segment_id": "source-s1", "text": "用户希望实现登录功能."},
        {"segment_id": "source-s2", "text": "需要支持邮箱,手机号和密码登录."},  # Source modified
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能."},
        {"segment_id": "target-s2", "text": "需要支持邮箱,微信和密码登录."},  # Target also modified (conflict)
    ]

    # 2. Initialize
    print("Loading MiniLM model...")
    embedding_provider = MiniLMEmbeddingProvider()
    diff_engine = DiffEngine(embedding_provider, threshold=0.70)
    merge_agent = MergeAgent(diff_engine)

    # 3. Execute merge
    print("Executing three-way merge...\n")
    result = merge_agent.merge(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. Output results
    print(f"Merge result ({result.source_id} + {result.target_id} ← {result.base_id})")
    print(f"Total segments: {result.total_segments}")
    print(f"Auto-merged: {result.auto_merged_count}")
    print(f"Conflicts: {result.conflict_count}")
    print(f"LLM resolved: {result.llm_resolved_count}")

    print("\nMerged segments:")
    for seg in result.merged_segments:
        print(f"  [{seg['segment_id']}] {seg['text']}")

    if result.conflicts:
        print("\nConflict details:")
        for conflict in result.conflicts:
            print(f"\n  [{conflict.segment_id}]")
            print(f"    Base: {conflict.text}")
            print(f"    Conflict content:\n{conflict.matched_text}")


if __name__ == "__main__":
    # Run conflict-free merge example
    demo_merge_without_conflicts()

    # Run merge with conflicts example
    demo_merge_with_conflicts()
