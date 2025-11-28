"""
LLM Provider Factory

Creates and manages LLM provider instances based on configuration.
"""

from __future__ import annotations

from typing import Dict, Optional, Type

from .base import LLMConfig, LLMProvider


# Provider registry
_PROVIDERS: Dict[str, Type[LLMProvider]] = {}


def register_provider(name: str, provider_class: Type[LLMProvider]) -> None:
    """Register a provider class."""
    _PROVIDERS[name.lower()] = provider_class


def get_provider(config: LLMConfig) -> LLMProvider:
    """
    Get a provider instance based on configuration.

    Args:
        config: LLM configuration with provider name

    Returns:
        Initialized provider instance

    Raises:
        ValueError: If provider is not registered
    """
    provider_name = config.provider.lower()

    if provider_name not in _PROVIDERS:
        # Try to auto-register known providers
        _auto_register_providers()

    if provider_name not in _PROVIDERS:
        available = ", ".join(_PROVIDERS.keys()) if _PROVIDERS else "none"
        raise ValueError(
            f"Unknown LLM provider: '{provider_name}'. "
            f"Available providers: {available}"
        )

    provider_class = _PROVIDERS[provider_name]
    return provider_class(config)


def get_provider_by_name(
    name: str,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    **kwargs,
) -> LLMProvider:
    """
    Convenience function to get a provider by name with optional overrides.

    Args:
        name: Provider name ('claude', 'openai')
        model: Optional model override
        api_key: Optional API key override
        **kwargs: Additional config options

    Returns:
        Initialized provider instance
    """
    config = LLMConfig(
        provider=name,
        model=model or _get_default_model(name),
        api_key=api_key,
        **kwargs,
    )
    return get_provider(config)


def list_providers() -> list:
    """List all registered provider names."""
    _auto_register_providers()
    return list(_PROVIDERS.keys())


def _get_default_model(provider_name: str) -> str:
    """Get default model for a provider."""
    defaults = {
        "claude": "claude-sonnet-4-5-20250929",
        "openai": "gpt-4o-mini",
    }
    return defaults.get(provider_name.lower(), "")


def _auto_register_providers() -> None:
    """Auto-register known providers if not already registered."""
    if "claude" not in _PROVIDERS:
        try:
            from .claude_provider import ClaudeProvider
            register_provider("claude", ClaudeProvider)
            register_provider("anthropic", ClaudeProvider)  # Alias
        except ImportError:
            pass

    if "openai" not in _PROVIDERS:
        try:
            from .openai_provider import OpenAIProvider
            register_provider("openai", OpenAIProvider)
            register_provider("gpt", OpenAIProvider)  # Alias
        except ImportError:
            pass


# Auto-register on module load
_auto_register_providers()
