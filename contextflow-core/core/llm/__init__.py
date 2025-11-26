"""
LLM Provider 模块

为 Draft Workflow / MergeAgent 提供可插拔的 LLM 实现。默认实现为
OpenAIProvider，使用 `openai` 官方 SDK；如需集成其他 LLM，只需实现
同样的接口即可。
"""

from .openai_provider import OpenAIProvider

__all__ = ["OpenAIProvider"]
