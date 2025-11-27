"""
Export endpoints

GET /api/v1/export/cfpack - export in .cfpack format
GET /api/v1/export/ledger - export JSONL Ledger (extension)
"""

from __future__ import annotations

import json
import sqlite3
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse

from core_api import __version__
from core_api.dependencies import get_db
from core_api.schemas import (
    CfpackResponse,
    CfpackProject,
    CfpackTurn,
    CfpackCommit,
    CfpackFindings,
    CfpackHash,
    CfpackMeta,
    TurnWindow,
    FacetSnapshot,
    PipelineConfig,
    Rings,
    Ring1,
    Ring2,
    Ring3,
    Entity,
    PreferenceKeyword,
    Segment,
    EvidenceRef,
)
from core_api.errors import project_not_found


router = APIRouter()


@router.get("/cfpack")
async def export_cfpack(
    project_id: str = Query(..., description="project ID"),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Export project in .cfpack format (single file JSON archive)

    .cfpack is standard JSON format containing complete semantic version history.

    Note: Draft export is part of Agentic Layer extension, not included in current MVP Core.
    """
    cursor = db.cursor()

    # Get project information
    project_row = cursor.execute(
        "SELECT project_id, name, created_at FROM projects WHERE project_id = ?",
        (project_id,)
    ).fetchone()

    if not project_row:
        raise project_not_found(project_id)

    # Get all Turns
    turn_rows = cursor.execute(
        """
        SELECT turn_hash, parent_turn_hash, role, content, rings_json, created_at
        FROM turns
        WHERE project_id = ?
        ORDER BY created_at ASC
        """,
        (project_id,)
    ).fetchall()

    turns = []
    all_keywords = {}  # Used to aggregate findings

    for row in turn_rows:
        rings_data = json.loads(row["rings_json"]) if row["rings_json"] else None

        # Build Rings object
        rings = None
        if rings_data:
            ring1_data = rings_data.get("ring1", {})
            ring2_data = rings_data.get("ring2", {})
            ring3_data = rings_data.get("ring3", {})

            rings = Rings(
                ring1=Ring1(
                    keywords=ring1_data.get("keywords", []),
                    entities=[Entity(**e) for e in ring1_data.get("entities", [])],
                    time_anchor=ring1_data.get("time_anchor"),
                    preference_keywords=[
                        PreferenceKeyword(**pk)
                        for pk in ring1_data.get("preference_keywords", [])
                    ]
                ),
                ring2=Ring2(
                    intent_seed=ring2_data.get("intent_seed"),
                    time_window=ring2_data.get("time_window"),
                    preference_soft=ring2_data.get("preference_soft", []),
                    unknown_slot=ring2_data.get("unknown_slot", []),
                    facets=ring2_data.get("facets", [])
                ),
                ring3=Ring3(
                    segments=[
                        Segment(**s) for s in ring3_data.get("segments", [])
                    ]
                )
            )

            # Aggregate keywords for findings
            for kw in ring1_data.get("keywords", []):
                if kw not in all_keywords:
                    all_keywords[kw] = {"count": 0, "polarity": "neutral"}
                all_keywords[kw]["count"] += 1

        turns.append(CfpackTurn(
            turn_hash=row["turn_hash"],
            parent_turn_hash=row["parent_turn_hash"],
            role=row["role"],
            content=row["content"],
            created_at=row["created_at"],
            rings=rings
        ))

    # Get all Commits
    commit_rows = cursor.execute(
        """
        SELECT commit_hash, parents_json, branch, turn_window_json,
               facet_snapshot_json, pipeline_config_json, created_at
        FROM commits
        WHERE project_id = ?
        ORDER BY created_at ASC
        """,
        (project_id,)
    ).fetchall()

    commits = []
    for row in commit_rows:
        turn_window_data = json.loads(row["turn_window_json"])
        facet_snapshot_data = json.loads(row["facet_snapshot_json"])
        pipeline_config_data = json.loads(row["pipeline_config_json"]) if row["pipeline_config_json"] else None

        # Build facet_snapshot
        facet_snapshots = []
        for fs in facet_snapshot_data:
            evidence = [EvidenceRef(**e) for e in fs.get("evidence", [])]
            facet_snapshots.append(FacetSnapshot(
                facet=fs["facet"],
                text=fs["text"],
                keywords=fs.get("keywords", []),
                evidence=evidence
            ))

        commits.append(CfpackCommit(
            commit_hash=row["commit_hash"],
            parent_hashes=json.loads(row["parents_json"]),
            branch=row["branch"],
            turn_window=TurnWindow(
                start_turn_hash=turn_window_data["start_turn_hash"],
                end_turn_hash=turn_window_data["end_turn_hash"]
            ),
            facet_snapshot=facet_snapshots,
            pipeline_config=PipelineConfig(**pipeline_config_data) if pipeline_config_data else None,
            created_at=row["created_at"]
        ))

    # Build findings (normalized semantic facts)
    aggregated_keywords = [
        {"lemma": kw, "count": data["count"], "polarity": data["polarity"]}
        for kw, data in sorted(all_keywords.items(), key=lambda x: -x[1]["count"])[:50]
    ]

    # Simplified must_have (high-frequency words)
    must_have = [kw for kw, data in all_keywords.items() if data["count"] >= 2][:20]

    findings = CfpackFindings(
        aggregated_keywords=aggregated_keywords,
        must_have=must_have,
        mustnt_have=[],
        evidence_refs=[]
    )

    # Build complete response (build first, calculate hash later)
    cfpack = CfpackResponse(
        version="1.0.0",
        cfpack_schema_version="1.0.0",
        project=CfpackProject(
            project_id=project_row["project_id"],
            name=project_row["name"],
            created_at=project_row["created_at"]
        ),
        turns=turns,
        findings=findings,
        commits=commits,
        hash=None,  # Calculate later
        meta=CfpackMeta(
            exported_at=datetime.now(timezone.utc).isoformat(),
            exported_by=f"core_api@{__version__}"
        )
    )

    # Calculate package hash (based on complete content excluding hash field)
    # Use JCS style: sorted keys, no extra whitespace
    content_for_hash = cfpack.model_dump(exclude={"hash"})
    canonical_json = json.dumps(content_for_hash, sort_keys=True, separators=(',', ':'))
    pack_hash = f"sha256:{hashlib.sha256(canonical_json.encode()).hexdigest()}"

    cfpack.hash = CfpackHash(
        algorithm="sha256-jcs-v1",
        pack_hash=pack_hash
    )

    # Return response with custom MIME type
    return JSONResponse(
        content=cfpack.model_dump(),
        media_type="application/vnd.contextflow.cfpack+json",
        headers={
            "Content-Disposition": f'attachment; filename="{project_id}.cfpack"'
        }
    )


@router.get("/ledger")
async def export_ledger(
    project_id: str = Query(..., description="project ID"),
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Export project in JSONL Ledger format

    One JSON object per line, sorted chronologically, for backup and streaming processing.
    """
    cursor = db.cursor()

    # Check if project exists
    project_row = cursor.execute(
        "SELECT project_id, name, created_at FROM projects WHERE project_id = ?",
        (project_id,)
    ).fetchone()

    if not project_row:
        raise project_not_found(project_id)

    def generate_jsonl():
        # 1. Output project metadata
        yield json.dumps({
            "type": "project",
            "project_id": project_row["project_id"],
            "name": project_row["name"],
            "created_at": project_row["created_at"]
        }) + "\n"

        # 2. Output all conversations
        conversations = cursor.execute(
            """
            SELECT conversation_id, project_id, title, created_at
            FROM conversations
            WHERE project_id = ?
            ORDER BY created_at ASC
            """,
            (project_id,)
        ).fetchall()

        for conv in conversations:
            yield json.dumps({
                "type": "conversation",
                "conversation_id": conv["conversation_id"],
                "project_id": conv["project_id"],
                "title": conv["title"],
                "created_at": conv["created_at"]
            }) + "\n"

        # 3. Output all Turns
        turns = cursor.execute(
            """
            SELECT turn_hash, parent_turn_hash, project_id, conversation_id,
                   role, content, rings_json, created_at
            FROM turns
            WHERE project_id = ?
            ORDER BY created_at ASC
            """,
            (project_id,)
        ).fetchall()

        for turn in turns:
            rings = json.loads(turn["rings_json"]) if turn["rings_json"] else None
            yield json.dumps({
                "type": "turn",
                "turn_hash": turn["turn_hash"],
                "parent_turn_hash": turn["parent_turn_hash"],
                "project_id": turn["project_id"],
                "conversation_id": turn["conversation_id"],
                "role": turn["role"],
                "content": turn["content"],
                "rings": rings,
                "created_at": turn["created_at"]
            }) + "\n"

        # 4. Output all Commits
        commits = cursor.execute(
            """
            SELECT commit_hash, project_id, branch, message, parents_json,
                   turn_window_json, facet_snapshot_json, pipeline_config_json,
                   draft_id, draft_text_hash, created_at
            FROM commits
            WHERE project_id = ?
            ORDER BY created_at ASC
            """,
            (project_id,)
        ).fetchall()

        for commit in commits:
            yield json.dumps({
                "type": "commit",
                "commit_hash": commit["commit_hash"],
                "project_id": commit["project_id"],
                "branch": commit["branch"],
                "message": commit["message"],
                "parent_hashes": json.loads(commit["parents_json"]),
                "turn_window": json.loads(commit["turn_window_json"]),
                "facet_snapshot": json.loads(commit["facet_snapshot_json"]),
                "pipeline_config": json.loads(commit["pipeline_config_json"]) if commit["pipeline_config_json"] else None,
                "draft_id": commit["draft_id"],
                "draft_text_hash": commit["draft_text_hash"],
                "created_at": commit["created_at"]
            }) + "\n"

    return StreamingResponse(
        generate_jsonl(),
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{project_id}.jsonl"'
        }
    )
