from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .errors import ProtocolError


class _DuplicateKey(ValueError):
    pass


def _closed_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateKey(f"duplicate JSON object key {key!r}")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON number {value}")


def _parse_binary64(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError("number is outside the finite I-JSON domain")
    return parsed


def _assert_protocol_domain(value: Any, path: str = "$") -> None:
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ProtocolError(
                "NON_CANONICAL_VALUE", "numbers must be finite", stage="parse"
            )
        return
    if isinstance(value, str):
        for character in value:
            if 0xD800 <= ord(character) <= 0xDFFF:
                raise ProtocolError(
                    "NON_CANONICAL_VALUE",
                    f"unpaired Unicode surrogate at {path}",
                    stage="parse",
                )
        return
    if isinstance(value, list):
        for index, member in enumerate(value):
            _assert_protocol_domain(member, f"{path}[{index}]")
        return
    if isinstance(value, dict):
        for key, member in value.items():
            _assert_protocol_domain(key, f"{path} key")
            _assert_protocol_domain(member, f"{path}.{key}")
        return
    raise ProtocolError(
        "NON_CANONICAL_VALUE",
        f"unsupported protocol value {type(value).__name__} at {path}",
        stage="parse",
    )


def loads_protocol_json(data: bytes | str) -> Any:
    try:
        source = data.decode("utf-8", errors="strict") if isinstance(data, bytes) else data
        value = json.loads(
            source,
            object_pairs_hook=_closed_pairs,
            parse_int=_parse_binary64,
            parse_float=_parse_binary64,
            parse_constant=_reject_constant,
        )
    except UnicodeDecodeError as error:
        raise ProtocolError("SCHEMA_INVALID", "invalid UTF-8", stage="parse") from error
    except (_DuplicateKey, json.JSONDecodeError, ValueError) as error:
        raise ProtocolError("SCHEMA_INVALID", str(error), stage="parse") from error
    _assert_protocol_domain(value)
    return value


def loads_metadata_json(data: bytes | str) -> Any:
    try:
        source = data.decode("utf-8", errors="strict") if isinstance(data, bytes) else data
        value = json.loads(
            source,
            object_pairs_hook=_closed_pairs,
            parse_constant=_reject_constant,
        )
    except UnicodeDecodeError as error:
        raise ProtocolError("SCHEMA_INVALID", "invalid UTF-8", stage="parse") from error
    except (_DuplicateKey, json.JSONDecodeError, ValueError) as error:
        raise ProtocolError("SCHEMA_INVALID", str(error), stage="parse") from error
    return value


def load_protocol_json(path: Path) -> Any:
    return loads_protocol_json(path.read_bytes())


def load_metadata_json(path: Path) -> Any:
    return loads_metadata_json(path.read_bytes())
