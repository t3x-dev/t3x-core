"""
LLM Provider module

Provides pluggable LLM implementations for Chat, Draft Workflow, and MergeAgent.

Supported providers:
- Claude (Anthropic): claude_provider.ClaudeProvider
- OpenAI: openai_provider.OpenAIProvider

Usage:
    from core.llm import get_provider, LLMConfig, ChatMessage

    # Using factory
    config = LLMConfig(provider="claude", model="claude-sonnet-4-5-20250929")
    provider = get_provider(config)

    # Generate response
    messages = [ChatMessage(role="user", content="Hello!")]
    result = provider.generate(messages)
    print(result.content)

    # Streaming
    for token in provider.generate_stream(messages):
        print(token, end="", flush=True)
"""

from .base import ChatMessage, GenerationResult, LLMConfig, LLMProvider
from .factory import get_provider, get_provider_by_name, list_providers, register_provider

# Import providers for convenience (they auto-register)
try:
    from .claude_provider import ClaudeProvider
except ImportError:
    ClaudeProvider = None  # type: ignore

try:
    from .openai_provider import OpenAIProvider
except ImportError:
    OpenAIProvider = None  # type: ignore


__all__ = [
    # Base classes
    "LLMProvider",
    "LLMConfig",
    "ChatMessage",
    "GenerationResult",
    # Factory functions
    "get_provider",
    "get_provider_by_name",
    "list_providers",
    "register_provider",
    # Provider classes
    "ClaudeProvider",
    "OpenAIProvider",
]
