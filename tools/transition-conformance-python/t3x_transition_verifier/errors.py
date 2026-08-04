from __future__ import annotations

from dataclasses import dataclass
from typing import Any


PROTOCOL_ERROR_CODES = frozenset(
    {
        "OBJECT_NOT_FOUND",
        "OBJECT_DIGEST_MISMATCH",
        "UNSUPPORTED_MEDIA_TYPE",
        "UNSUPPORTED_SEMANTICS",
        "SCHEMA_INVALID",
        "NON_CANONICAL_VALUE",
        "INTEGRITY_CHAIN_INVALID",
        "EFFECT_CLAIM_FALSE",
        "STALE_BASE",
    }
)


class ProtocolError(Exception):
    def __init__(self, code: str, message: str, *, stage: str) -> None:
        super().__init__(message)
        self.code = code
        self.stage = stage


class ReplayPreconditionFailed(Exception):
    pass


@dataclass(frozen=True)
class Divergence(Exception):
    vector_file: str
    vector_id: str
    stage: str
    expected: Any
    actual: Any
    expected_hex: str | None = None
    actual_hex: str | None = None

    def __str__(self) -> str:
        lines = [
            f"transition conformance divergence: {self.vector_file}#{self.vector_id}",
            f"stage: {self.stage}",
            f"expected: {self.expected!r}",
            f"actual: {self.actual!r}",
        ]
        if self.expected_hex is not None:
            lines.append(f"expected UTF-8 hex: {self.expected_hex}")
        if self.actual_hex is not None:
            lines.append(f"actual UTF-8 hex: {self.actual_hex}")
        return "\n".join(lines)
