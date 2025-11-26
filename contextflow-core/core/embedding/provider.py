"""
嵌入提供者实现

基于 sentence-transformers 的 MiniLM 模型。
"""

from __future__ import annotations

import math
from typing import List

from sentence_transformers import SentenceTransformer


class MiniLMEmbeddingProvider:
    """
    MiniLM 嵌入提供者

    使用 sentence-transformers 的 all-MiniLM-L6-v2 模型：
    - 轻量级（22M 参数）
    - 快速推理（适合实时 Diff）
    - 支持多语言（中英文均可）
    - 384 维向量
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        初始化嵌入提供者

        Args:
            model_name: sentence-transformers 模型名称
        """
        self.model_name = model_name
        self.model = SentenceTransformer(model_name)

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        编码文本为向量

        Args:
            texts: 文本列表

        Returns:
            向量列表
        """
        if not texts:
            return []

        # sentence-transformers 返回 numpy array，需转为 list
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()

    def similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """
        计算两个向量的余弦相似度

        Args:
            vec_a: 向量 A
            vec_b: 向量 B

        Returns:
            相似度分数（0~1）
        """
        # 余弦相似度公式：cos(θ) = (A · B) / (||A|| × ||B||)
        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))

        if norm_a == 0 or norm_b == 0:
            return 0.0

        cos_sim = dot_product / (norm_a * norm_b)

        # 余弦相似度范围 [-1, 1]，归一化到 [0, 1]
        return (cos_sim + 1) / 2
