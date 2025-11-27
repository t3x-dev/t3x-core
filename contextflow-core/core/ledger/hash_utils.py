"""
Hash utility functions

Uses JCS (JSON Canonicalization Scheme) + SHA-256.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def jcs_normalize(data: Dict[str, Any]) -> str:
    """
    Normalize JSON using JCS

    JCS guarantees:
    1. Keys sorted in lexicographic order
    2. No extra whitespace
    3. Consistent Unicode escaping

    Args:
        data: Dictionary to normalize

    Returns:
        Normalized JSON string
    """
    # Python's json.dumps uses lexicographic ordering by default (with sort_keys=True)
    # and separators removes extra whitespace
    return json.dumps(
        data,
        sort_keys=True,
        separators=(',', ':'),
        ensure_ascii=False,
    )


def compute_jcs_hash(data: Dict[str, Any], prefix: str = "sha256") -> str:
    """
    Compute SHA-256 hash of JCS-normalized JSON

    Args:
        data: Dictionary to hash
        prefix: Hash prefix (default "sha256")

    Returns:
        Hash value (format: sha256:abc123...)
    """
    jcs_str = jcs_normalize(data)
    hash_bytes = hashlib.sha256(jcs_str.encode('utf-8')).hexdigest()
    return f"{prefix}:{hash_bytes}"
