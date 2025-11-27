"""
Three-way Semantic Diff Engine Example

Demonstrates how to use DiffEngine for semantic diff.
"""

from core.diff import DiffEngine
from core.embedding import MiniLMEmbeddingProvider


def demo_two_way_diff():
    """Demonstrate two-way Diff (Draft vs Commit)"""
    print("=== Two-way Diff Example ===\n")

    # 1. Prepare segment data
    base_segments = [
        {"segment_id": "base-s1", "text": "用户希望实现一个登录功能."},
        {"segment_id": "base-s2", "text": "需要支持邮箱和密码登录."},
        {"segment_id": "base-s3", "text": "登录Failed时显示Errortip."},
    ]

    target_segments = [
        {"segment_id": "target-s1", "text": "用户希望实现登录功能."},  # Similar but slightly different
        {"segment_id": "target-s2", "text": "需要支持邮箱,手机号和密码登录."},  # Modified
        {"segment_id": "target-s3", "text": "添加记住我功能."},  # Added
    ]

    # 2. Initialize embedding provider
    print("Loading MiniLM model...")
    embedding_provider = MiniLMEmbeddingProvider()

    # 3. Initialize DiffEngine
    diff_engine = DiffEngine(
        embedding_provider=embedding_provider,
        threshold=0.70,
    )

    # 4. Execute two-way Diff
    print("Computing semantic diff...\n")
    result = diff_engine.diff_two_way(
        base_id="commit-abc123",
        base_segments=base_segments,
        target_id="draft-xyz789",
        target_segments=target_segments,
    )

    # 5. Output results
    print(f"Diff result ({result.base_id} → {result.target_id})")
    print(f"Threshold: {result.threshold}")
    print(f"Total segments: {result.total_segments}")
    print(f"  - Same: {result.same_count}")
    print(f"  - Added: {result.added_count}")
    print(f"  - Removed: {result.removed_count}")
    print(f"  - Modified: {result.modified_count}")
    print(f"  - Conflicts: {result.conflict_count}")
    print("\nDetailed Diff:")

    for diff in result.segment_diffs:
        print(f"\n[{diff.diff_type.value.upper()}] {diff.segment_id}")
        print(f"  Text: {diff.text}")
        if diff.similarity is not None:
            print(f"  Similarity: {diff.similarity:.2f}")
        if diff.matched_segment_id:
            print(f"  Match: {diff.matched_segment_id}")
            print(f"  Matched text: {diff.matched_text}")


def demo_three_way_diff():
    """Demonstrate three-way Diff (Merge preview)"""
    print("\n\n=== Three-way Diff Example ===\n")

    # 1. Prepare segment data
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

    # 3. Execute three-way Diff
    print("Computing three-way semantic diff...\n")
    result = diff_engine.diff_three_way(
        base_id="commit-base",
        base_segments=base_segments,
        source_id="commit-source",
        source_segments=source_segments,
        target_id="commit-target",
        target_segments=target_segments,
    )

    # 4. Output results
    print(f"Three-way Diff result")
    print(f"Threshold: {result.threshold}")
    print(f"Total segments: {result.total_segments}")
    print(f"  - Same: {result.same_count}")
    print(f"  - Added: {result.added_count}")
    print(f"  - Removed: {result.removed_count}")
    print(f"  - Modified: {result.modified_count}")
    print(f"  - Conflicts: {result.conflict_count}")
    print("\nDetailed Diff:")

    for diff in result.segment_diffs:
        print(f"\n[{diff.diff_type.value.upper()}] {diff.segment_id}")
        print(f"  Text: {diff.text}")
        if diff.similarity is not None:
            print(f"  Similarity: {diff.similarity:.2f}")
        if diff.matched_segment_id:
            print(f"  Match: {diff.matched_segment_id}")
        if diff.matched_text:
            print(f"  Matched text: {diff.matched_text}")


if __name__ == "__main__":
    # Run two-way Diff example
    demo_two_way_diff()

    # Run three-way Diff example
    demo_three_way_diff()
