"""
OpenAI LLM Provider

Implements the LLMProvider interface for OpenAI's models.
Supports both synchronous and streaming generation.
"""

from __future__ import annotations

import os
from typing import AsyncIterator, Iterator, List, Optional

from .base import ChatMessage, GenerationResult, LLMConfig, LLMProvider

try:
    from openai import AsyncOpenAI, OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore
    AsyncOpenAI = None  # type: ignore


class OpenAIProvider(LLMProvider):
    """
    OpenAI LLM Provider using the official OpenAI SDK.

    Supports GPT-4, GPT-4o, and other OpenAI models with streaming.
    """

    def __init__(self, config: LLMConfig):
        super().__init__(config)

        if OpenAI is None:
            raise ImportError(
                "openai package not installed. "
                "Please run `pip install openai` or remove OpenAIProvider usage."
            )

        self.api_key = config.api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenAI API key missing. Set OPENAI_API_KEY env var "
                "or pass api_key in LLMConfig."
            )

        self.model = config.model or "gpt-4o-mini"
        self.default_temperature = config.temperature
        self.default_max_tokens = config.max_tokens
        self.base_url = config.base_url

        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self.async_client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url) if AsyncOpenAI else None

    @property
    def provider_name(self) -> str:
        return "openai"

    def _build_messages(self, messages: List[ChatMessage]) -> list:
        """Convert ChatMessage list to OpenAI format."""
        return [{"role": msg.role, "content": msg.content} for msg in messages]

    def generate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """Generate a response synchronously."""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=self._build_messages(messages),
            temperature=temperature if temperature is not None else self.default_temperature,
            max_tokens=max_tokens or self.default_max_tokens,
            stream=False,
        )

        choice = response.choices[0]
        return GenerationResult(
            content=choice.message.content or "",
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            finish_reason=choice.finish_reason,
        )

    def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Iterator[str]:
        """Generate a response with streaming (synchronous)."""
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=self._build_messages(messages),
            temperature=temperature if temperature is not None else self.default_temperature,
            max_tokens=max_tokens or self.default_max_tokens,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def agenerate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """Generate a response asynchronously."""
        if not self.async_client:
            raise ImportError("AsyncOpenAI not available")

        response = await self.async_client.chat.completions.create(
            model=self.model,
            messages=self._build_messages(messages),
            temperature=temperature if temperature is not None else self.default_temperature,
            max_tokens=max_tokens or self.default_max_tokens,
            stream=False,
        )

        choice = response.choices[0]
        return GenerationResult(
            content=choice.message.content or "",
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            finish_reason=choice.finish_reason,
        )

    async def agenerate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Generate a response with streaming (async)."""
        if not self.async_client:
            raise ImportError("AsyncOpenAI not available")

        stream = await self.async_client.chat.completions.create(
            model=self.model,
            messages=self._build_messages(messages),
            temperature=temperature if temperature is not None else self.default_temperature,
            max_tokens=max_tokens or self.default_max_tokens,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
