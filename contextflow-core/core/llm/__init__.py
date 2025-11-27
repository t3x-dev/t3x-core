"""
LLM Provider module

Provides pluggable LLM implementations for Draft Workflow / MergeAgent. Default
implementation is OpenAIProvider using the official `openai` SDK. To integrate
other LLMs, simply implement the same interface.
"""

from .openai_provider import OpenAIProvider

__all__ = ["OpenAIProvider"]
