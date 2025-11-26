"""
哈希工具函数

使用 JCS (JSON Canonicalization Scheme) + SHA-256。
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def jcs_normalize(data: Dict[str, Any]) -> str:
    """
    使用 JCS 规范化 JSON

    JCS 保证：
    1. 键按字典序排序
    2. 无多余空格
    3. Unicode 转义一致

    Args:
        data: 待规范化的字典

    Returns:
        规范化后的 JSON 字符串
    """
    # Python 的 json.dumps 默认就是字典序排序（如果 sort_keys=True）
    # 并且 separators 去掉多余空格
    return json.dumps(
        data,
        sort_keys=True,
        separators=(',', ':'),
        ensure_ascii=False,
    )


def compute_jcs_hash(data: Dict[str, Any], prefix: str = "sha256") -> str:
    """
    计算 JCS 规范化后的 SHA-256 哈希

    Args:
        data: 待哈希的字典
        prefix: 哈希前缀（默认 "sha256"）

    Returns:
        哈希值（格式：sha256:abc123...）
    """
    jcs_str = jcs_normalize(data)
    hash_bytes = hashlib.sha256(jcs_str.encode('utf-8')).hexdigest()
    return f"{prefix}:{hash_bytes}"
