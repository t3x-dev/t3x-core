"""
嵌入提供者模块

提供基于 sentence-transformers 的 MiniLM 嵌入实现。
"""

from .provider import MiniLMEmbeddingProvider

__all__ = ["MiniLMEmbeddingProvider"]
