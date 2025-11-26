"""
JSONL Ledger 演示

展示如何使用 Turn/Commit/Draft Ledger。
"""

from pathlib import Path
import sys
import tempfile

# 添加 core 到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ledger import (
    TurnLedger, TurnRecord,
    CommitLedger, CommitRecord,
    DraftLedger, DraftRecord,
)


def main():
    """演示 Ledger 的使用"""

    # 使用临时目录
    temp_dir = Path(tempfile.mkdtemp())
    ledgers_dir = temp_dir / "ledgers"
    ledgers_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("JSONL Ledger 演示")
    print("=" * 80)
    print(f"\n临时目录: {temp_dir}\n")

    # ========================================
    # 1. Turn Ledger 演示
    # ========================================
    print("\n" + "─" * 80)
    print("📝 Turn Ledger 演示")
    print("─" * 80)

    turn_ledger = TurnLedger(ledgers_dir / "turns.jsonl")

    # 创建第一个 turn（根 turn）
    # 注意：实际使用时应该调用 RingExtractor 生成 ring_snapshot
    # 这里为演示简化，使用 None（实际生产代码不应该这样）
    turn1 = TurnRecord.create(
        project_id="proj_demo",
        conversation_id="conv_001",
        role="user",
        content="I want to visit Japan in November.",
        parent_turn_hash=None,  # 根 turn
        ring_snapshot=None,  # 实际应该从 RingExtractor 获取
    )
    turn_ledger.append(turn1)
    print(f"\n✅ Turn 1 已追加:")
    print(f"   Turn Hash: {turn1.turn_hash}")
    print(f"   Parent: {turn1.parent_turn_hash}")
    print(f"   Content: {turn1.content}")

    # 创建第二个 turn（链接到 turn1）
    turn2 = TurnRecord.create(
        project_id="proj_demo",
        conversation_id="conv_001",
        role="assistant",
        content="Great! November is a beautiful time to visit Japan.",
        parent_turn_hash=turn1.turn_hash,
        ring_snapshot=None,  # 实际应该从 RingExtractor 获取
    )
    turn_ledger.append(turn2)
    print(f"\n✅ Turn 2 已追加:")
    print(f"   Turn Hash: {turn2.turn_hash}")
    print(f"   Parent: {turn2.parent_turn_hash}")
    print(f"   Content: {turn2.content}")

    # 读取所有 turn
    all_turns = turn_ledger.read_all()
    print(f"\n📚 读取所有 Turn ({len(all_turns)}):")
    for i, turn in enumerate(all_turns, 1):
        print(f"   {i}. [{turn.role}] {turn.content[:40]}...")

    # ========================================
    # 2. Commit Ledger 演示
    # ========================================
    print("\n\n" + "─" * 80)
    print("💾 Commit Ledger 演示")
    print("─" * 80)

    commit_ledger = CommitLedger(ledgers_dir / "commits.jsonl")

    # 创建第一个 commit
    commit1 = CommitRecord.create(
        project_id="proj_demo",
        branch="main",
        parent_hashes=[],  # 根 commit
        turn_window={
            "start_turn_hash": turn1.turn_hash,
            "end_turn_hash": turn2.turn_hash,
        },
        facet_snapshot=[
            {"facet": "destination", "text": "Japan"},
            {"facet": "time", "text": "November"},
        ],
        pipeline_config={
            "extractor": "spacy",
            "model": "en_core_web_sm",
            "version": "3.7.0",
        },
    )
    commit_ledger.append(commit1)
    print(f"\n✅ Commit 1 已追加:")
    print(f"   Commit Hash: {commit1.commit_hash}")
    print(f"   Branch: {commit1.branch}")
    print(f"   Parents: {commit1.parent_hashes}")
    print(f"   Facet Snapshot: {commit1.facet_snapshot}")

    # 创建第二个 commit（链接到 commit1）
    commit2 = CommitRecord.create(
        project_id="proj_demo",
        branch="main",
        parent_hashes=[commit1.commit_hash],
        turn_window={
            "start_turn_hash": turn1.turn_hash,
            "end_turn_hash": turn2.turn_hash,
        },
        facet_snapshot=[
            {"facet": "destination", "text": "Japan"},
            {"facet": "time", "text": "November"},
            {"facet": "mood", "text": "beautiful"},
        ],
        pipeline_config={
            "extractor": "spacy",
            "model": "en_core_web_sm",
            "version": "3.7.0",
        },
    )
    commit_ledger.append(commit2)
    print(f"\n✅ Commit 2 已追加:")
    print(f"   Commit Hash: {commit2.commit_hash}")
    print(f"   Parents: {commit2.parent_hashes}")

    # 读取所有 commit
    all_commits = commit_ledger.read_all()
    print(f"\n📚 读取所有 Commit ({len(all_commits)}):")
    for i, commit in enumerate(all_commits, 1):
        print(f"   {i}. {commit.commit_hash} (branch={commit.branch}, parents={len(commit.parent_hashes)})")

    # ========================================
    # 3. Draft Ledger 演示
    # ========================================
    print("\n\n" + "─" * 80)
    print("📄 Draft Ledger 演示")
    print("─" * 80)

    draft_ledger = DraftLedger(ledgers_dir / "drafts.jsonl")

    # 创建一个 draft
    draft1 = DraftRecord(
        draft_id="draft_20251118_001",
        project_id="proj_demo",
        base_commit_hash=commit1.commit_hash,
        turn_anchor_hash=turn2.turn_hash,
        bridge_id="plan",
        bridge_payload={
            "bridge": "plan",
            "threshold": 0.60,
            "prompt": "你现在扮演一名规划师...",
        },
        must_have=["japan", "november"],
        mustnt_have=["crowded"],
        llm_config={
            "provider": "openai",
            "model": "gpt-4",
            "temperature": 0.3,
        },
        text="## 目标\n访问日本，11月出行。\n\n## 里程碑\n1. 预订机票\n2. 预订酒店...",
        status="ephemeral",
    )
    draft_ledger.append(draft1)
    print(f"\n✅ Draft 已追加:")
    print(f"   Draft ID: {draft1.draft_id}")
    print(f"   Base Commit: {draft1.base_commit_hash}")
    print(f"   Bridge: {draft1.bridge_id}")
    print(f"   Must-Have: {draft1.must_have}")
    print(f"   Mustn't-Have: {draft1.mustnt_have}")
    print(f"   Text (前 100 字符): {draft1.text[:100]}...")

    # 读取所有 draft
    all_drafts = draft_ledger.read_all()
    print(f"\n📚 读取所有 Draft ({len(all_drafts)}):")
    for i, draft in enumerate(all_drafts, 1):
        print(f"   {i}. {draft.draft_id} (bridge={draft.bridge_id}, status={draft.status})")

    # ========================================
    # 4. 查看 JSONL 文件内容
    # ========================================
    print("\n\n" + "─" * 80)
    print("📁 JSONL 文件内容")
    print("─" * 80)

    print(f"\n📄 Turn Ledger ({ledgers_dir / 'turns.jsonl'}):")
    with open(ledgers_dir / "turns.jsonl", "r") as f:
        for i, line in enumerate(f, 1):
            if i <= 2:  # 只显示前 2 行
                import json
                data = json.loads(line)
                print(f"   Line {i}: {data['turn_hash']} (role={data['role']})")

    print(f"\n📄 Commit Ledger ({ledgers_dir / 'commits.jsonl'}):")
    with open(ledgers_dir / "commits.jsonl", "r") as f:
        for i, line in enumerate(f, 1):
            if i <= 2:
                import json
                data = json.loads(line)
                print(f"   Line {i}: {data['commit_hash']} (branch={data['branch']})")

    print("\n" + "=" * 80)
    print("✅ 演示完成！")
    print(f"📁 临时文件保存在: {temp_dir}")
    print("=" * 80)


if __name__ == "__main__":
    main()
