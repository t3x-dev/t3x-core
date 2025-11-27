"""
Polarity annotation rule engine

Annotates keywords with polarity (-1/0/+1) based on dependency parsing + YAML/JSON rule tables.

Rules:
1. Positive verbs (want/prefer/need/like/should) + no negation → +1
2. Negative verbs (dislike/reject/avoid/hate/cannot) → -1
3. Positive verbs + negation modifier (don't want / not like) → -1
4. Other cases → 0 (neutral)

Does not use sentiment dictionaries (VADER/SentiWordNet), ensuring determinism.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Literal, Set

from dataclasses import dataclass


@dataclass(frozen=True)
class PolarityRule:
    """
    Polarity rule entry

    Examples:
        - verb: "want", polarity: 1, check_negation: True
        - verb: "avoid", polarity: -1, check_negation: False
    """

    verb: str  # Verb lemma
    polarity: Literal[-1, 1]  # Base polarity
    check_negation: bool = True  # Whether to check negation modifier


DEFAULT_POLARITY_RULES = {
    # Positive verbs (with negation check)
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
    # Negative verbs (no negation check needed, already negative)
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

# Negation markers (for dependency tree lookup)
NEGATION_MARKERS = {
    "not", "n't", "never", "no", "none", "nobody", "nothing", "neither",
    "nor", "nowhere", "hardly", "scarcely", "barely"
}


class PolarityRuleEngine:
    """
    Polarity rule engine

    Loads rule tables and annotates keywords with polarity based on dependency parsing.
    """

    def __init__(self, rules_path: Path | None = None):
        """
        Initialize rule engine

        Args:
            rules_path: Custom rule file path (JSON format)
                       If None, uses built-in default rules
        """
        if rules_path and rules_path.exists():
            self.rules = self._load_rules_from_file(rules_path)
        else:
            self.rules = DEFAULT_POLARITY_RULES

        # Build fast lookup indexes
        self.positive_verbs: Dict[str, PolarityRule] = {
            rule.verb: rule for rule in self.rules["positive"]
        }
        self.negative_verbs: Dict[str, PolarityRule] = {
            rule.verb: rule for rule in self.rules["negative"]
        }

    def _load_rules_from_file(self, path: Path) -> Dict[str, List[PolarityRule]]:
        """Load rules from JSON file"""
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
        verb_token,  # Verb Token (for rule lookup)
    ) -> Literal[-1, 0, 1]:
        """
        Return keyword polarity based on dependency tree and rule table

        Args:
            token: spaCy Token (keyword)
            verb_token: Associated verb Token

        Returns:
            -1/0/+1
        """
        verb_lemma = verb_token.lemma_.lower()

        # Check if it matches positive verbs
        if verb_lemma in self.positive_verbs:
            rule = self.positive_verbs[verb_lemma]
            if rule.check_negation and self._has_negation(verb_token):
                return -1  # Positive + negation = negative
            return 1

        # Check if it matches negative verbs
        if verb_lemma in self.negative_verbs:
            rule = self.negative_verbs[verb_lemma]
            if rule.check_negation and self._has_negation(verb_token):
                # Double negation: don't avoid → positive? (edge case, conservatively treat as neutral)
                return 0
            return -1

        # No rule matched → neutral
        return 0

    def _has_negation(self, token) -> bool:
        """
        Check if token has negation modifier

        Looks for negation markers like neg, advmod, aux in dependency tree.

        Args:
            token: spaCy Token

        Returns:
            True if negation modifier present
        """
        # Check child nodes for negation words
        for child in token.children:
            if child.dep_ in {"neg", "advmod", "aux"}:
                if child.lemma_.lower() in NEGATION_MARKERS:
                    return True
                # Check contracted forms (don't, won't, can't)
                if "n't" in child.text.lower():
                    return True

        # Check parent node (in some cases negation is at higher level)
        if token.head and token.head != token:
            for sibling in token.head.children:
                if sibling.dep_ == "neg" and sibling.lemma_.lower() in NEGATION_MARKERS:
                    return True

        return False

    def extract_preference_relations(self, doc) -> List[tuple]:
        """
        Extract (verb, object, polarity) triples from spaCy Doc

        Traverses dependency tree to find opinion/preference-related verbs and their objects.

        Args:
            doc: spaCy Doc object

        Returns:
            List of (verb_token, object_token, polarity)
        """
        relations = []

        for token in doc:
            # Only focus on verbs
            if token.pos_ not in {"VERB", "AUX"}:
                continue

            verb_lemma = token.lemma_.lower()

            # Check if it matches rules
            if verb_lemma not in self.positive_verbs and verb_lemma not in self.negative_verbs:
                continue

            # Find objects (dobj, pobj, attr)
            for child in token.children:
                if child.dep_ in {"dobj", "pobj", "attr", "oprd"}:
                    polarity = self.get_polarity(child, token)
                    relations.append((token, child, polarity))

                # Handle prepositional phrases (e.g., "travel to Japan")
                if child.dep_ == "prep":
                    for grandchild in child.children:
                        if grandchild.dep_ == "pobj":
                            polarity = self.get_polarity(grandchild, token)
                            relations.append((token, grandchild, polarity))

        return relations

    def save_rules(self, path: Path):
        """
        Save current rules to JSON file

        Args:
            path: Save path
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
