"""
OpenAI LLM Provider

This module provides a minimal OpenAI Chat Completions wrapper for Draft Workflow
polish step and MergeAgent conflict resolution. The implementation is designed as
an optional dependency: as long as this file exists in the repository and the
`openai` package is declared in requirements, the CLI/Agentic layer can instantiate
it when needed; offline/fully local deployments can replace it with other Providers.
"""

from __future__ import annotations

import os
from typing import Optional

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - fallback logic when import fails
    OpenAI = None  # type: ignore


class OpenAIProvider:
    """
    OpenAI LLM Provider, implementing minimal interface required by DraftWorkflow/MergeAgent.

    Attributes:
        api_key: OpenAI API Key
        model: Model name, e.g., `gpt-4o`, `gpt-4-turbo`
        temperature: Temperature
        max_tokens: Maximum output tokens
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ):
        if OpenAI is None:
            raise ImportError(
                "openai package not installed. "
                "Please run `pip install openai` or remove OpenAIProvider usage."
            )

        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenAI API key missing. Set OPENAI_API_KEY env var "
                "or pass api_key argument when constructing OpenAIProvider."
            )

        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.client = OpenAI(api_key=self.api_key)

    def generate(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
        system_prompt: Optional[str] = None,
    ) -> str:
        """
        Call OpenAI Chat Completions API to generate text.

        Conforms to Draft Workflow's LLMProvider Protocol.

        Args:
            prompt: Complete prompt (including Bridge template + Evidence)
            temperature: Generation temperature (default 0.3)
            max_tokens: Maximum token count (default 2048)
            system_prompt: System prompt (optional, for advanced configuration)

        Returns:
            Generated text
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    def resolve_conflict(
        self,
        base_text: str,
        source_text: str,
        target_text: str,
        context: str = "",
    ) -> str:
        """
        Conflict resolution helper interface for MergeAgent.

        Args:
            base_text: Common ancestor text
            source_text: Source branch text
            target_text: Target branch text
            context: Additional context
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
        return self.generate(prompt)
