"""
Agentic Layer 模块

提供可插拔的 Agent 实现：
- MergeAgent: 三方合并 + 冲突检测 + 可选 LLM 辅助
- （未来）SummaryAgent: 对话摘要生成
"""

from .merge_agent import LLMProvider, MergeAgent, MergeResult

__all__ = [
    "MergeAgent",
    "MergeResult",
    "LLMProvider",
]
