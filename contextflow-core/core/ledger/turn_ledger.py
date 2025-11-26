"""
Turn Ledger（对话轮次账本）

记录原始对话轮次及其哈希链。

文件路径：`.contextflow/ledgers/turns.jsonl`
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, TextIO

from .hash_utils import compute_jcs_hash


def utc_now_iso() -> str:
    """返回 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class TurnRecord:
    """
    Turn 记录（对应 STORAGE_ARCHITECTURE.md 中的 Turn Ledger 结构）

    ⚠️ 重要：按照 docs/ARCHITECTURE.zh.md:45-55，Turn Ledger 必须保存 Ring 1/2/3 快照，
    才能在 Draft Workflow、Diff、Merge 时重放语义，保证可复现性。

    所有字段参与哈希（除了 turn_hash 本身）。
    """

    turn_hash: str  # SHA-256 哈希（JCS 规范化）
    parent_turn_hash: Optional[str]  # 上一个 turn_hash；根 turn 为 null
    project_id: str
    conversation_id: str
    role: str  # "user" | "assistant" | "system" | "tool"
    content: str  # 原始文本

    # Ring 1/2/3 快照（按文档要求必须持久化）
    ring_snapshot: Optional[Dict[str, Any]] = None  # Ring 1/2/3 输出的序列化形式

    metadata: Optional[Dict[str, Any]] = None  # 可选元数据（如模型名）
    created_at: str = None  # ISO 8601 时间戳
    schema_version: str = "turn_v1"

    def __post_init__(self):
        if self.created_at is None:
            object.__setattr__(self, 'created_at', utc_now_iso())

    @classmethod
    def create(
        cls,
        project_id: str,
        conversation_id: str,
        role: str,
        content: str,
        parent_turn_hash: Optional[str] = None,
        ring_snapshot: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> TurnRecord:
        """
        创建新的 Turn 记录（自动计算哈希）

        Args:
            project_id: 项目 ID
            conversation_id: 对话 ID
            role: 角色
            content: 内容
            parent_turn_hash: 父 turn 哈希
            ring_snapshot: Ring 1/2/3 快照（必须持久化，用于 Draft/Diff/Merge）
            metadata: 元数据

        Returns:
            TurnRecord
        """
        # 构造待哈希的 payload（不包含 turn_hash）
        payload = {
            "parent_turn_hash": parent_turn_hash,
            "project_id": project_id,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "ring_snapshot": ring_snapshot,  # Ring 快照参与哈希
            "metadata": metadata,
            "created_at": utc_now_iso(),
            "schema_version": "turn_v1",
        }

        # 计算哈希
        turn_hash = compute_jcs_hash(payload)

        return cls(
            turn_hash=turn_hash,
            parent_turn_hash=parent_turn_hash,
            project_id=project_id,
            conversation_id=conversation_id,
            role=role,
            content=content,
            ring_snapshot=ring_snapshot,  # 包含 Ring 快照
            metadata=metadata,
            created_at=payload["created_at"],
            schema_version="turn_v1",
        )

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于序列化）"""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TurnRecord:
        """从字典创建"""
        return cls(**data)

    @staticmethod
    def serialize_ring_output(ring_output) -> Dict[str, Any]:
        """
        将 RingOutput 序列化为 ring_snapshot

        Args:
            ring_output: RingOutput 实例（来自 core/extractors/base.py）

        Returns:
            可序列化的字典
        """
        return {
            "turn_id": ring_output.turn_id,
            "ring1": {
                "keywords": [
                    {
                        "text": kw.text,
                        "lemma": kw.lemma,
                        "polarity": kw.polarity,
                        "pos": kw.pos,
                        "entity_type": kw.entity_type,
                        "confidence": kw.confidence,
                    }
                    for kw in ring_output.ring1.keywords
                ],
                "time_anchor": ring_output.ring1.time_anchor,
                "topic": ring_output.ring1.topic,
            },
            "ring2": {
                "facets": [
                    {
                        "facet_type": facet.facet_type,
                        "key": facet.key,
                        "value": facet.value,
                        "confidence": facet.confidence,
                    }
                    for facet in ring_output.ring2.facets
                ]
            },
            "ring3": {
                "segments": [
                    {
                        "segment_id": seg.segment_id,
                        "text": seg.text,
                        "start_char": seg.start_char,
                        "end_char": seg.end_char,
                    }
                    for seg in ring_output.ring3.segments
                ]
            },
        }


class TurnLedger:
    """
    Turn Ledger 管理器

    负责：
    1. 追加新 turn 到 JSONL
    2. 验证哈希链
    3. 读取历史 turn
    """

    def __init__(self, ledger_path: Path):
        """
        初始化 Turn Ledger

        Args:
            ledger_path: JSONL 文件路径（如 .contextflow/ledgers/turns.jsonl）
        """
        self.ledger_path = ledger_path
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        # 确保文件存在
        if not self.ledger_path.exists():
            self.ledger_path.touch()

    def append(self, turn: TurnRecord) -> None:
        """
        追加新 turn 到账本

        Args:
            turn: Turn 记录
        """
        # 验证哈希（可选，确保数据完整性）
        self._verify_hash(turn)

        # 追加到 JSONL
        with open(self.ledger_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(turn.to_dict(), ensure_ascii=False) + "\n")

    def read_all(self) -> List[TurnRecord]:
        """
        读取所有 turn 记录

        Returns:
            TurnRecord 列表
        """
        records = []
        with open(self.ledger_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    data = json.loads(line)
                    records.append(TurnRecord.from_dict(data))
        return records

    def read_by_conversation(self, conversation_id: str) -> List[TurnRecord]:
        """
        读取指定对话的所有 turn

        Args:
            conversation_id: 对话 ID

        Returns:
            TurnRecord 列表（按顺序）
        """
        all_turns = self.read_all()
        conversation_turns = [
            turn for turn in all_turns
            if turn.conversation_id == conversation_id
        ]
        # 按 created_at 排序
        conversation_turns.sort(key=lambda t: t.created_at)
        return conversation_turns

    def get_last_turn(self, conversation_id: str) -> Optional[TurnRecord]:
        """
        获取指定对话的最后一个 turn

        Args:
            conversation_id: 对话 ID

        Returns:
            TurnRecord 或 None
        """
        turns = self.read_by_conversation(conversation_id)
        return turns[-1] if turns else None

    def _verify_hash(self, turn: TurnRecord) -> None:
        """
        验证 turn 的哈希是否正确

        Args:
            turn: Turn 记录

        Raises:
            ValueError: 如果哈希不匹配
        """
        payload = turn.to_dict()
        del payload["turn_hash"]

        expected_hash = compute_jcs_hash(payload)
        if turn.turn_hash != expected_hash:
            raise ValueError(
                f"Turn hash mismatch: expected {expected_hash}, got {turn.turn_hash}"
            )
