"""
LLM Provider Base Interface

Defines the abstract interface for all LLM providers. Both synchronous and
streaming generation are supported.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Iterator, List, Optional


@dataclass
class ChatMessage:
    """A single message in a conversation."""
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class LLMConfig:
    """Configuration for LLM providers."""
    provider: str = "claude"
    model: str = "claude-sonnet-4-5-20250929"
    temperature: float = 0.7
    max_tokens: int = 4096
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    extra: dict = field(default_factory=dict)


@dataclass
class GenerationResult:
    """Result of a generation call."""
    content: str
    model: str
    usage: Optional[dict] = None
    finish_reason: Optional[str] = None


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.

    All providers must implement both synchronous and streaming generation.
    """

    def __init__(self, config: LLMConfig):
        self.config = config

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name (e.g., 'claude', 'openai')."""
        pass

    @abstractmethod
    def generate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """
        Generate a response synchronously.

        Args:
            messages: List of chat messages
            temperature: Override default temperature
            max_tokens: Override default max_tokens

        Returns:
            GenerationResult with the complete response
        """
        pass

    @abstractmethod
    def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Iterator[str]:
        """
        Generate a response with streaming (synchronous iterator).

        Args:
            messages: List of chat messages
            temperature: Override default temperature
            max_tokens: Override default max_tokens

        Yields:
            String tokens as they are generated
        """
        pass

    @abstractmethod
    async def agenerate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """
        Generate a response asynchronously.

        Args:
            messages: List of chat messages
            temperature: Override default temperature
            max_tokens: Override default max_tokens

        Returns:
            GenerationResult with the complete response
        """
        pass

    @abstractmethod
    async def agenerate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """
        Generate a response with streaming (async iterator).

        Args:
            messages: List of chat messages
            temperature: Override default temperature
            max_tokens: Override default max_tokens

        Yields:
            String tokens as they are generated
        """
        pass

    def resolve_conflict(
        self,
        base_text: str,
        source_text: str,
        target_text: str,
        context: str = "",
    ) -> str:
        """
        Helper method for merge conflict resolution.

        Args:
            base_text: Common ancestor text
            source_text: Source branch text
            target_text: Target branch text
            context: Additional context

        Returns:
            Merged text
        """
        prompt = f"""You are helping resolve a semantic merge conflict.

Base version (common ancestor):
{base_text}

Source branch changed it to:
{source_text}

Target branch changed it to:
{target_text}

{f"Additional context: {context}" if context else ""}

Please produce a merged version that respects both changes. Output only the merged text."""

        result = self.generate([ChatMessage(role="user", content=prompt)])
        return result.content
