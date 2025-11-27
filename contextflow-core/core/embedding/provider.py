"""
Embedding provider implementation

Based on sentence-transformers MiniLM model.
"""

from __future__ import annotations

import math
from typing import List

from sentence_transformers import SentenceTransformer


class MiniLMEmbeddingProvider:
    """
    MiniLM embedding provider

    Uses sentence-transformers all-MiniLM-L6-v2 model:
    - Lightweight (22M parameters)
    - Fast inference (suitable for real-time Diff)
    - Supports multiple languages (Chinese and English)
    - 384-dimensional vectors
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize embedding provider

        Args:
            model_name: sentence-transformers model name
        """
        self.model_name = model_name
        self.model = SentenceTransformer(model_name)

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        Encode texts to vectors

        Args:
            texts: List of texts

        Returns:
            List of vectors
        """
        if not texts:
            return []

        # sentence-transformers returns numpy array, need to convert to list
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors

        Args:
            vec_a: Vector A
            vec_b: Vector B

        Returns:
            Similarity score (0~1)
        """
        # Cosine similarity formula: cos(θ) = (A · B) / (||A|| × ||B||)
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        cos_sim = dot_product / (norm_a * norm_b)

        # Cosine similarity range [-1, 1], normalize to [0, 1]
        return (cos_sim + 1) / 2
