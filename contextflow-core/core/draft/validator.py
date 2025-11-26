"""
Must-Have / Mustn't-Have 验证器

检查生成的草稿文本是否满足关键词约束。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Set
import re


@dataclass(frozen=True)
class ValidationResult:
    """
    验证结果

    Attributes:
        passed: 是否通过验证
        missing_must_have: 缺失的 Must-Have 关键词
        violated_mustnt_have: 违规出现的 Mustn't-Have 关键词
    """

    passed: bool
    missing_must_have: List[str]
    violated_mustnt_have: List[str]

    @property
    def is_complete(self) -> bool:
        """所有 Must-Have 都已包含"""
        return len(self.missing_must_have) == 0

    @property
    def is_clean(self) -> bool:
        """没有 Mustn't-Have 违规"""
        return len(self.violated_mustnt_have) == 0


class MustHaveValidator:
    """
    Must-Have / Mustn't-Have 验证器

    使用词形归一后的关键词进行匹配，避免因时态/单复数差异导致漏检。
    """

    def __init__(self, case_sensitive: bool = False):
        """
        初始化验证器

        Args:
            case_sensitive: 是否区分大小写（默认不区分）
        """
        self.case_sensitive = case_sensitive

    def validate(
        self,
        text: str,
        must_have: List[str],
        mustnt_have: List[str],
    ) -> ValidationResult:
        """
        验证文本是否满足约束

        Args:
            text: 待验证的文本
            must_have: Must-Have 关键词列表（已归一）
            mustnt_have: Mustn't-Have 关键词列表（已归一）

        Returns:
            ValidationResult
        """
        # 预处理文本（转小写，提取单词）
        text_normalized = self._normalize_text(text)
        text_words = self._extract_words(text_normalized)

        # 检查 Must-Have
        missing_must_have = []
        for keyword in must_have:
            keyword_normalized = self._normalize_text(keyword)
            if not self._contains_word(text_words, keyword_normalized):
                missing_must_have.append(keyword)

        # 检查 Mustn't-Have
        violated_mustnt_have = []
        for keyword in mustnt_have:
            keyword_normalized = self._normalize_text(keyword)
            if self._contains_word(text_words, keyword_normalized):
                violated_mustnt_have.append(keyword)

        # 判断是否通过
        passed = (len(missing_must_have) == 0) and (len(violated_mustnt_have) == 0)

        return ValidationResult(
            passed=passed,
            missing_must_have=missing_must_have,
            violated_mustnt_have=violated_mustnt_have,
        )

    def _normalize_text(self, text: str) -> str:
        """
        规范化文本

        Args:
            text: 原始文本

        Returns:
            规范化后的文本
        """
        if not self.case_sensitive:
            text = text.lower()
        return text

    def _extract_words(self, text: str) -> Set[str]:
        """
        提取文本中的所有单词

        Args:
            text: 文本

        Returns:
            单词集合
        """
        # 使用正则提取单词（字母、数字、下划线）
        words = re.findall(r'\w+', text)
        return set(words)

    def _contains_word(self, words: Set[str], target: str) -> bool:
        """
        检查单词集合中是否包含目标词

        支持：
        1. 精确匹配（travel）
        2. 子词匹配（travel 在 travels 中）

        Args:
            words: 单词集合
            target: 目标词

        Returns:
            True 如果包含
        """
        # 精确匹配
        if target in words:
            return True

        # 子词匹配（允许词形变化）
        for word in words:
            if target in word or word in target:
                return True

        return False
