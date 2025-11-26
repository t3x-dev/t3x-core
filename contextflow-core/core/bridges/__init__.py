"""
Bridge 模板系统

Bridge 是连接对话证据（evidence）和草稿生成（draft）的桥梁。
每个 Bridge 定义了一种特定的写作风格和提示词模板。

支持的 Bridge 类型：
- /plan: 规划型草稿
- /explain: 概念讲解型草稿
- /summary: 总结型草稿
- /clarify: 澄清型草稿
"""

from .loader import BridgeLoader, BridgeTemplate, BUILTIN_BRIDGES_DIR

__all__ = [
    "BridgeLoader",
    "BridgeTemplate",
    "BUILTIN_BRIDGES_DIR",
]
