"""
JSONL Ledger Demo

Demonstrates how to use Turn/Commit/Draft Ledger.
"""

from pathlib import Path
import sys
import tempfile

# Add core to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ledger import (
    TurnLedger, TurnRecord,
    CommitLedger, CommitRecord,
    DraftLedger, DraftRecord,
)


def main():
    """Demonstrate Ledger usage"""

    # Use temporary directory
    temp_dir = Path(tempfile.mkdtemp())
    ledgers_dir = temp_dir / "ledgers"
    ledgers_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("JSONL Ledger Demo")
    print("=" * 80)
    print(f"\nTemporary directory: {temp_dir}\n")

    # ========================================
    # 1. Turn Ledger Demo
    # ========================================
    print("\n" + "─" * 80)
    print("📝 Turn Ledger Demo")
    print("─" * 80)

    turn_ledger = TurnLedger(ledgers_dir / "turns.jsonl")

    # Create first turn (root turn)
    # Note: In actual use, should call RingExtractor to generate ring_snapshot
    # This is simplified for demo purposes, actual production code should not do this
    turn1 = TurnRecord.create(
        project_id="proj_demo",
        conversation_id="conv_001",
        role="user",
        content="I want to visit Japan in November.",
        parent_turn_hash=None,  # Root turn
        ring_snapshot=None,  # Should get from RingExtractor in actual use
    )
    turn_ledger.append(turn1)
    print(f"\n✅ Turn 1 appended:")
    print(f"   Turn Hash: {turn1.turn_hash}")
    print(f"   Parent: {turn1.parent_turn_hash}")
    print(f"   Content: {turn1.content}")

    # Create second turn (linked to turn1)
    turn2 = TurnRecord.create(
        project_id="proj_demo",
        conversation_id="conv_001",
        role="assistant",
        content="Great! November is a beautiful time to visit Japan.",
        parent_turn_hash=turn1.turn_hash,
        ring_snapshot=None,  # Should get from RingExtractor in actual use
    )
    turn_ledger.append(turn2)
    print(f"\n✅ Turn 2 appended:")
    print(f"   Turn Hash: {turn2.turn_hash}")
    print(f"   Parent: {turn2.parent_turn_hash}")
    print(f"   Content: {turn2.content}")

    # Read all turns
    all_turns = turn_ledger.read_all()
    print(f"\n📚 Read all Turns ({len(all_turns)}):")
    for i, turn in enumerate(all_turns, 1):
        print(f"   {i}. [{turn.role}] {turn.content[:40]}...")

    # ========================================
    # 2. Commit Ledger Demo
    # ========================================
    print("\n\n" + "─" * 80)
    print("💾 Commit Ledger Demo")
    print("─" * 80)

    commit_ledger = CommitLedger(ledgers_dir / "commits.jsonl")

    # Create first commit
    commit1 = CommitRecord.create(
        project_id="proj_demo",
        branch="main",
        parent_hashes=[],  # Root commit
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
    print(f"\n✅ Commit 1 appended:")
    print(f"   Commit Hash: {commit1.commit_hash}")
    print(f"   Branch: {commit1.branch}")
    print(f"   Parents: {commit1.parent_hashes}")
    print(f"   Facet Snapshot: {commit1.facet_snapshot}")

    # Create second commit (linked to commit1)
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
    print(f"\n✅ Commit 2 appended:")
    print(f"   Commit Hash: {commit2.commit_hash}")
    print(f"   Parents: {commit2.parent_hashes}")

    # Read all commits
    all_commits = commit_ledger.read_all()
    print(f"\n📚 Read all Commits ({len(all_commits)}):")
    for i, commit in enumerate(all_commits, 1):
        print(f"   {i}. {commit.commit_hash} (branch={commit.branch}, parents={len(commit.parent_hashes)})")

    # ========================================
    # 3. Draft Ledger Demo
    # ========================================
    print("\n\n" + "─" * 80)
    print("📄 Draft Ledger Demo")
    print("─" * 80)

    draft_ledger = DraftLedger(ledgers_dir / "drafts.jsonl")

    # Create a draft
    draft1 = DraftRecord(
        draft_id="draft_20251118_001",
        project_id="proj_demo",
        base_commit_hash=commit1.commit_hash,
        turn_anchor_hash=turn2.turn_hash,
        bridge_id="plan",
        bridge_payload={
            "bridge": "plan",
            "threshold": 0.60,
            "prompt": "You are now playing the role of a planner...",
        },
        must_have=["japan", "november"],
        mustnt_have=["crowded"],
        llm_config={
            "provider": "openai",
            "model": "gpt-4",
            "temperature": 0.3,
        },
        text="## Objective\nVisit Japan, travel in November.\n\n## Milestones\n1. Book flights\n2. Book hotels...",
        status="ephemeral",
    )
    draft_ledger.append(draft1)
    print(f"\n✅ Draft appended:")
    print(f"   Draft ID: {draft1.draft_id}")
    print(f"   Base Commit: {draft1.base_commit_hash}")
    print(f"   Bridge: {draft1.bridge_id}")
    print(f"   Must-Have: {draft1.must_have}")
    print(f"   Mustn't-Have: {draft1.mustnt_have}")
    print(f"   Text (first 100 characters): {draft1.text[:100]}...")

    # Read all drafts
    all_drafts = draft_ledger.read_all()
    print(f"\n📚 Read all Drafts ({len(all_drafts)}):")
    for i, draft in enumerate(all_drafts, 1):
        print(f"   {i}. {draft.draft_id} (bridge={draft.bridge_id}, status={draft.status})")

    # ========================================
    # 4. View JSONL file contents
    # ========================================
    print("\n\n" + "─" * 80)
    print("📁 JSONL File Contents")
    print("─" * 80)

    print(f"\n📄 Turn Ledger ({ledgers_dir / 'turns.jsonl'}):")
    with open(ledgers_dir / "turns.jsonl", "r") as f:
        for i, line in enumerate(f, 1):
            if i <= 2:  # Only show first 2 lines
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
    print("✅ Demo Complete!")
    print(f"📁 Temporary files saved at: {temp_dir}")
    print("=" * 80)


if __name__ == "__main__":
    main()
