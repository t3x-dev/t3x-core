"""
Claude (Anthropic) LLM Provider

Implements the LLMProvider interface for Anthropic's Claude models.
Supports both synchronous and streaming generation.
"""

from __future__ import annotations

import json
import os
from typing import AsyncIterator, Iterator, List, Optional

import httpx

from .base import ChatMessage, GenerationResult, LLMConfig, LLMProvider


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class ClaudeProvider(LLMProvider):
    """
    Claude LLM Provider using Anthropic's Messages API.

    Supports Claude 3.5/4 models with streaming.
    """

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.api_key = config.api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Anthropic API key missing. Set ANTHROPIC_API_KEY env var "
                "or pass api_key in LLMConfig."
            )
        self.base_url = config.base_url or ANTHROPIC_API_URL
        self.model = config.model or "claude-sonnet-4-5-20250929"
        self.default_temperature = config.temperature
        self.default_max_tokens = config.max_tokens

    @property
    def provider_name(self) -> str:
        return "claude"

    def _build_headers(self) -> dict:
        """Build request headers for Anthropic API."""
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        }

    def _build_payload(
        self,
        messages: List[ChatMessage],
        stream: bool,
        temperature: Optional[float],
        max_tokens: Optional[int],
    ) -> dict:
        """Build request payload for Anthropic API."""
        system_messages = []
        conversation = []

        for msg in messages:
            if msg.role == "system":
                system_messages.append(msg.content)
            elif msg.role in ("user", "assistant"):
                conversation.append({
                    "role": msg.role,
                    "content": [{"type": "text", "text": msg.content}]
                })

        payload = {
            "model": self.model,
            "max_tokens": max_tokens or self.default_max_tokens,
            "temperature": temperature if temperature is not None else self.default_temperature,
            "stream": stream,
            "messages": conversation,
        }

        if system_messages:
            payload["system"] = "\n\n".join(system_messages)

        return payload

    def _parse_response(self, response_data: dict) -> GenerationResult:
        """Parse non-streaming response."""
        content_blocks = response_data.get("content", [])
        text_content = ""
        for block in content_blocks:
            if block.get("type") == "text":
                text_content += block.get("text", "")

        return GenerationResult(
            content=text_content,
            model=response_data.get("model", self.model),
            usage=response_data.get("usage"),
            finish_reason=response_data.get("stop_reason"),
        )

    def _parse_stream_event(self, line: str) -> Optional[str]:
        """Parse a single SSE line and extract token if present."""
        line = line.strip()
        if not line:
            return None

        if line.startswith("event:"):
            return None

        if line.startswith("data:"):
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                return None

            try:
                data = json.loads(data_str)
                event_type = data.get("type", "")

                if event_type == "content_block_delta":
                    delta = data.get("delta", {})
                    if delta.get("type") == "text_delta":
                        return delta.get("text", "")

                elif event_type == "message_delta":
                    delta = data.get("delta", {})
                    return delta.get("text")

            except json.JSONDecodeError:
                pass

        return None

    def generate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """Generate a response synchronously."""
        payload = self._build_payload(messages, stream=False, temperature=temperature, max_tokens=max_tokens)

        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                self.base_url,
                headers=self._build_headers(),
                json=payload,
            )
            response.raise_for_status()
            return self._parse_response(response.json())

    def generate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> Iterator[str]:
        """Generate a response with streaming (synchronous)."""
        payload = self._build_payload(messages, stream=True, temperature=temperature, max_tokens=max_tokens)

        with httpx.Client(timeout=120.0) as client:
            with client.stream(
                "POST",
                self.base_url,
                headers=self._build_headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                buffer = ""

                for chunk in response.iter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        token = self._parse_stream_event(line)
                        if token:
                            yield token

    async def agenerate(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> GenerationResult:
        """Generate a response asynchronously."""
        payload = self._build_payload(messages, stream=False, temperature=temperature, max_tokens=max_tokens)

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self.base_url,
                headers=self._build_headers(),
                json=payload,
            )
            response.raise_for_status()
            return self._parse_response(response.json())

    async def agenerate_stream(
        self,
        messages: List[ChatMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Generate a response with streaming (async)."""
        payload = self._build_payload(messages, stream=True, temperature=temperature, max_tokens=max_tokens)

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                self.base_url,
                headers=self._build_headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                buffer = ""

                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        token = self._parse_stream_event(line)
                        if token:
                            yield token
