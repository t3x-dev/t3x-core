"""
OpenAI LLM Provider

该模块提供一个最小的 OpenAI Chat Completions 封装，用于 Draft Workflow
的 polish 步骤和 MergeAgent 的冲突解决。实现被设计为可选依赖：
只要仓库里存在该文件并在 requirements 中声明 `openai` 包，CLI/Agentic
层即可在需要时实例化它；离线/完全本地化部署也可以替换成别的 Provider。
"""

from __future__ import annotations

import os
from typing import Optional

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - 导入失败时的提示逻辑
    OpenAI = None  # type: ignore


class OpenAIProvider:
    """
    OpenAI LLM Provider，实现 DraftWorkflow/ MergeAgent 所需的最小接口。

    Attributes:
        api_key: OpenAI API Key
        model: 模型名称，例如 `gpt-4o`, `gpt-4-turbo`
        temperature: 温度
        max_tokens: 最大输出 token
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
        调用 OpenAI Chat Completions API 生成文本。

        符合 Draft Workflow 的 LLMProvider Protocol。

        Args:
            prompt: 完整的提示词（包含 Bridge 模板 + Evidence）
            temperature: 生成温度（默认 0.3）
            max_tokens: 最大 token 数（默认 2048）
            system_prompt: 系统提示词（可选，用于高级配置）

        Returns:
            生成的文本
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
        MergeAgent 用的冲突解决辅助接口。

        Args:
            base_text: 共同祖先文本
            source_text: Source 分支文本
            target_text: Target 分支文本
            context: 额外提示
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
