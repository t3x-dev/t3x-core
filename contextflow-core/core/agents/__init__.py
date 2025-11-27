"""
Agentic Layer module

Provides pluggable Agent implementations:
- MergeAgent: Three-way merge + conflict detection + optional LLM assistance
- (Future) SummaryAgent: Conversation summary generation
"""

from .merge_agent import LLMProvider, MergeAgent, MergeResult

__all__ = [
    "MergeAgent",
    "MergeResult",
    "LLMProvider",
]
