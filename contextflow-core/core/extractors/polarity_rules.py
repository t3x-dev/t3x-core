"""
极性标注规则引擎

基于依存句法分析 + YAML/JSON 规则表，为关键词标注极性 (-1/0/+1)。

规则：
1. 正向谓词（want/prefer/need/like/should）+ 无否定 → +1
2. 负向谓词（dislike/reject/avoid/hate/cannot）→ -1
3. 正向谓词 + 否定修饰（don't want / not like）→ -1
4. 其他情况 → 0（中性）

不使用情感词典（VADER/SentiWordNet），保证决定论。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Literal, Set

from dataclasses import dataclass


@dataclass(frozen=True)
class PolarityRule:
    """
    极性规则条目

    Examples:
        - verb: "want", polarity: 1, check_negation: True
        - verb: "avoid", polarity: -1, check_negation: False
    """

    verb: str  # 谓词原形（lemma）
    polarity: Literal[-1, 1]  # 基础极性
    check_negation: bool = True  # 是否检查否定修饰


DEFAULT_POLARITY_RULES = {
    # 正向谓词（带否定检查）
    "positive": [
        PolarityRule("want", 1, True),
        PolarityRule("prefer", 1, True),
        PolarityRule("need", 1, True),
        PolarityRule("like", 1, True),
        PolarityRule("love", 1, True),
        PolarityRule("enjoy", 1, True),
        PolarityRule("should", 1, True),
        PolarityRule("must", 1, True),
        PolarityRule("hope", 1, True),
        PolarityRule("wish", 1, True),
        PolarityRule("plan", 1, True),
        PolarityRule("intend", 1, True),
    ],
    # 负向谓词（不需要否定检查，已经是负向）
    "negative": [
        PolarityRule("dislike", -1, False),
        PolarityRule("hate", -1, False),
        PolarityRule("avoid", -1, False),
        PolarityRule("reject", -1, False),
        PolarityRule("refuse", -1, False),
        PolarityRule("cannot", -1, False),
        PolarityRule("can't", -1, False),
        PolarityRule("won't", -1, False),
        PolarityRule("wouldn't", -1, False),
    ],
}

# 否定词集合（用于依存树查找）
NEGATION_MARKERS = {
    "not", "n't", "never", "no", "none", "nobody", "nothing", "neither",
    "nor", "nowhere", "hardly", "scarcely", "barely"
}


class PolarityRuleEngine:
    """
    极性规则引擎

    加载规则表，并基于依存句法分析为关键词标注极性。
    """

    def __init__(self, rules_path: Path | None = None):
        """
        初始化规则引擎

        Args:
            rules_path: 自定义规则文件路径（JSON 格式）
                       如果为 None，使用内置默认规则
        """
        if rules_path and rules_path.exists():
            self.rules = self._load_rules_from_file(rules_path)
        else:
            self.rules = DEFAULT_POLARITY_RULES

        # 构建快速查找索引
        self.positive_verbs: Dict[str, PolarityRule] = {
            rule.verb: rule for rule in self.rules["positive"]
        }
        self.negative_verbs: Dict[str, PolarityRule] = {
            rule.verb: rule for rule in self.rules["negative"]
        }

    def _load_rules_from_file(self, path: Path) -> Dict[str, List[PolarityRule]]:
        """从 JSON 文件加载规则"""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        return {
            "positive": [
                PolarityRule(**rule) for rule in data.get("positive", [])
            ],
            "negative": [
                PolarityRule(**rule) for rule in data.get("negative", [])
            ],
        }

    def get_polarity(
        self,
        token,  # spaCy Token object
        verb_token,  # 谓词 Token（用于查规则）
    ) -> Literal[-1, 0, 1]:
        """
        基于依存树和规则表，返回关键词的极性

        Args:
            token: spaCy Token（关键词）
            verb_token: 关联的谓词 Token

        Returns:
            -1/0/+1
        """
        verb_lemma = verb_token.lemma_.lower()

        # 检查是否命中正向谓词
        if verb_lemma in self.positive_verbs:
            rule = self.positive_verbs[verb_lemma]
            if rule.check_negation and self._has_negation(verb_token):
                return -1  # 正向 + 否定 = 负向
            return 1

        # 检查是否命中负向谓词
        if verb_lemma in self.negative_verbs:
            rule = self.negative_verbs[verb_lemma]
            if rule.check_negation and self._has_negation(verb_token):
                # 双重否定：don't avoid → 正向？（边缘情况，保守处理为中性）
                return 0
            return -1

        # 未命中任何规则 → 中性
        return 0

    def _has_negation(self, token) -> bool:
        """
        检查 token 是否有否定修饰

        查找依存树中的 neg、advmod、aux 等否定标记。

        Args:
            token: spaCy Token

        Returns:
            True 如果有否定修饰
        """
        # 检查子节点中是否有否定词
        for child in token.children:
            if child.dep_ in {"neg", "advmod", "aux"}:
                if child.lemma_.lower() in NEGATION_MARKERS:
                    return True
                # 检查缩写形式（don't, won't, can't）
                if "n't" in child.text.lower():
                    return True

        # 检查父节点（某些情况下否定词在上层）
        if token.head and token.head != token:
            for sibling in token.head.children:
                if sibling.dep_ == "neg" and sibling.lemma_.lower() in NEGATION_MARKERS:
                    return True

        return False

    def extract_preference_relations(self, doc) -> List[tuple]:
        """
        从 spaCy Doc 中提取 (谓词, 宾语, 极性) 三元组

        遍历依存树，找到 opinion/preference 相关的动词及其宾语。

        Args:
            doc: spaCy Doc object

        Returns:
            List of (verb_token, object_token, polarity)
        """
        relations = []

        for token in doc:
            # 只关注动词
            if token.pos_ not in {"VERB", "AUX"}:
                continue

            verb_lemma = token.lemma_.lower()

            # 检查是否命中规则
            if verb_lemma not in self.positive_verbs and verb_lemma not in self.negative_verbs:
                continue

            # 找到宾语（dobj, pobj, attr）
            for child in token.children:
                if child.dep_ in {"dobj", "pobj", "attr", "oprd"}:
                    polarity = self.get_polarity(child, token)
                    relations.append((token, child, polarity))

                # 处理介词短语（如 "travel to Japan"）
                if child.dep_ == "prep":
                    for grandchild in child.children:
                        if grandchild.dep_ == "pobj":
                            polarity = self.get_polarity(grandchild, token)
                            relations.append((token, grandchild, polarity))

        return relations

    def save_rules(self, path: Path):
        """
        保存当前规则到 JSON 文件

        Args:
            path: 保存路径
        """
        data = {
            "positive": [
                {"verb": rule.verb, "polarity": rule.polarity, "check_negation": rule.check_negation}
                for rule in self.rules["positive"]
            ],
            "negative": [
                {"verb": rule.verb, "polarity": rule.polarity, "check_negation": rule.check_negation}
                for rule in self.rules["negative"]
            ],
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
