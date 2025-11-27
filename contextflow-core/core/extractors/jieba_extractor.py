"""
Ring 1/2/3 extractor (based on jieba Chinese tokenization)

Specifically designed for Chinese text Ring extraction:
- Ring 1: Keywords + POS tagging + named entities
- Ring 2: Intent recognition + Facets
- Ring 3: Sentence structure

Determinism guarantee: same input + same configuration → same output
"""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

try:
    import jieba
    import jieba.posseg as pseg
    JIEBA_AVAILABLE = True
except ImportError:
    JIEBA_AVAILABLE = False

from .base import (
    ExtractorConfig,
    ExtractorMetadata,
    ExtractorPlugin,
    Facet,
    Keyword,
    Ring1Output,
    Ring2Output,
    Ring3Output,
    RingOutput,
    Segment,
)


# Chinese POS to universal POS mapping
POS_MAPPING = {
    # Noun class
    "n": "NOUN",      # Common noun
    "nr": "PROPN",    # Person name
    "ns": "PROPN",    # Place name
    "nt": "PROPN",    # Organization name
    "nz": "PROPN",    # Other proper noun
    "nl": "NOUN",     # Nominal idiom
    "ng": "NOUN",     # Nominal morpheme
    # Verb class
    "v": "VERB",      # Verb
    "vd": "VERB",     # Adverbial verb
    "vn": "VERB",     # Nominal verb
    "vg": "VERB",     # Verbal morpheme
    # Adjective class
    "a": "ADJ",       # Adjective
    "ad": "ADJ",      # Adverbial adjective
    "an": "ADJ",      # Nominal adjective
    "ag": "ADJ",      # Adjectival morpheme
    # Numerals and quantifiers
    "m": "NUM",       # Numeral
    "q": "NUM",       # Quantifier
    # Time words
    "t": "TIME",      # Time word
    # Others
    "d": "ADV",       # Adverb
    "p": "ADP",       # Preposition
    "c": "CONJ",      # Conjunction
    "r": "PRON",      # Pronoun
    "u": "PART",      # Particle
    "x": "PUNCT",     # Punctuation
    "w": "PUNCT",     # Punctuation
}

# Entity type mapping (based on POS)
ENTITY_TYPE_MAPPING = {
    "nr": "PERSON",   # Person name
    "ns": "GPE",      # Place name
    "nt": "ORG",      # Organization name
    "nz": "MISC",     # Other proper noun
    "t": "DATE",      # Time
}

# Positive verbs (indicating like, want)
POSITIVE_VERBS = {
    "喜欢", "想", "想要", "希望", "期待", "渴望", "热爱", "偏好",
    "推荐", "建议", "选择", "倾向", "支持", "赞成", "欣赏",
    "学习", "研究", "探索", "了解", "掌握",
}

# Negative verbs (indicating dislike, avoid)
NEGATIVE_VERBS = {
    "讨厌", "不喜欢", "避免", "拒绝", "反对", "排斥", "厌恶",
    "不想", "不要", "不愿", "害怕", "担心",
}

# Stop words
STOPWORDS = {
    "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着",
    "没有", "看", "好", "自己", "这", "那", "吗", "啊", "呢",
    "吧", "嗯", "哦", "呀", "哈", "哎", "唉", "嘿", "喂",
}

# Question words (for unknown_slot)
QUESTION_WORDS = {"什么", "哪里", "哪个", "怎么", "如何", "为什么", "多少", "几"}


class JiebaExtractor(ExtractorPlugin):
    """
    jieba-based Chinese Ring 1/2/3 extractor

    Features:
    1. Chinese tokenization: uses jieba accurate mode
    2. POS tagging: uses jieba.posseg
    3. Named entities: recognizes person names, place names, organizations based on POS
    4. Polarity annotation: based on positive/negative verb rules
    5. Sentence segmentation: based on Chinese punctuation, preserves original positions
    """

    def __init__(self, config: ExtractorConfig):
        """
        Initialize extractor

        Args:
            config: extractor configuration
        """
        if not JIEBA_AVAILABLE:
            raise ImportError(
                "jieba is required for JiebaExtractor. "
                "Install it with: pip install jieba"
            )

        self.config = config
        self.jieba_version = jieba.__version__

        # Initialize jieba (ensure thread safety)
        jieba.initialize()

    def extract(self, turn_id: str, content: str) -> RingOutput:
        """
        Extract Ring 1/2/3 from a single turn
        """
        # Tokenize with POS tagging and position tracking
        words_with_pos = self._tokenize_with_position(content)

        ring1 = self._extract_ring1(words_with_pos)
        ring2 = self._extract_ring2(words_with_pos, ring1)
        ring3 = self._extract_ring3(content)

        return RingOutput(
            turn_id=turn_id,
            ring1=ring1,
            ring2=ring2,
            ring3=ring3,
        )

    def _tokenize_with_position(self, content: str) -> List[Tuple[str, str, int, int]]:
        """
        Tokenize and record position of each word

        Returns:
            List of (word, pos, start, end)
        """
        result = []
        current_pos = 0

        for word, flag in pseg.cut(content):
            # Find the position of this word in the original text
            start = content.find(word, current_pos)
            if start == -1:
                start = current_pos
            end = start + len(word)
            current_pos = end

            result.append((word, flag, start, end))

        return result

    def _extract_ring1(self, words_with_pos: List[Tuple[str, str, int, int]]) -> Ring1Output:
        """
        Extract Ring 1: Keyword axis
        """
        keywords = []
        time_anchor = None
        topic = None
        current_polarity = 0

        for word, flag, start, end in words_with_pos:
            # Skip punctuation and stop words
            if flag in ("x", "w") or word in STOPWORDS:
                continue

            # Skip single-character words (unless verb or proper noun)
            if len(word) == 1 and flag not in ("v", "nr", "ns", "nt", "nz"):
                continue

            # Update polarity context
            if word in POSITIVE_VERBS:
                current_polarity = 1
            elif word in NEGATIVE_VERBS:
                current_polarity = -1

            # Map POS tags
            pos = POS_MAPPING.get(flag, "X")

            # Only keep nouns, verbs, adjectives, time words
            if pos not in {"NOUN", "PROPN", "VERB", "ADJ", "TIME", "NUM"}:
                if flag not in ("d", "p", "u"):
                    current_polarity = 0
                continue

            # Get entity type
            entity_type = ENTITY_TYPE_MAPPING.get(flag)

            # Detect time anchor
            if flag == "t" and time_anchor is None:
                time_anchor = word

            # Determine polarity
            polarity = 0
            if pos in {"NOUN", "PROPN"} and current_polarity != 0:
                polarity = current_polarity

            keyword = Keyword(
                text=word,
                lemma=word.lower(),
                polarity=polarity,
                pos=pos,
                entity_type=entity_type,
            )
            keywords.append(keyword)

            if pos in {"NOUN", "PROPN"}:
                current_polarity = 0

        # Topic extraction
        for kw in keywords:
            if kw.pos in {"NOUN", "PROPN"} and topic is None:
                topic = kw.lemma
                break

        return Ring1Output(
            keywords=keywords,
            time_anchor=time_anchor,
            topic=topic,
        )

    def _extract_ring2(self, words_with_pos: List[Tuple[str, str, int, int]], ring1: Ring1Output) -> Ring2Output:
        """
        Extract Ring 2: Lightweight relations / Facets
        """
        facets = []

        # 1. Intent Seed
        main_verbs = [word for word, flag, _, _ in words_with_pos if flag.startswith("v")]
        if main_verbs:
            facets.append(Facet(
                facet_type="intent_seed",
                key="intent",
                value=main_verbs[0],
                confidence=0.9,
            ))

        # 2. Time Window
        if ring1.time_anchor:
            facets.append(Facet(
                facet_type="time_window",
                key="time",
                value=ring1.time_anchor,
                confidence=0.8,
            ))

        # 3. Preference Soft
        for kw in ring1.preference_keywords:
            if kw.polarity == 1:
                facets.append(Facet(
                    facet_type="preference_soft",
                    key="prefer",
                    value=kw.lemma,
                    confidence=0.7,
                ))
            elif kw.polarity == -1:
                facets.append(Facet(
                    facet_type="preference_soft",
                    key="avoid",
                    value=kw.lemma,
                    confidence=0.7,
                ))

        # 4. Unknown Slot (question words only, not all pronouns)
        for word, flag, _, _ in words_with_pos:
            if word in QUESTION_WORDS:
                facets.append(Facet(
                    facet_type="unknown_slot",
                    key="question",
                    value=word,
                    confidence=0.6,
                ))

        return Ring2Output(facets=facets)

    def _extract_ring3(self, content: str) -> Ring3Output:
        """
        Extract Ring 3: Sentence structure

        Preserves original positions, no stripping.
        """
        # Use regex to find all sentence boundaries
        sentence_endings = re.compile(r'[.!?;\n]+')

        segments = []
        last_end = 0
        segment_idx = 1

        for match in sentence_endings.finditer(content):
            # Sentence from last_end to match.end() (including punctuation)
            sent_start = last_end
            sent_end = match.end()
            sent_text = content[sent_start:sent_end]

            # Skip pure whitespace
            if sent_text.strip():
                segments.append(Segment(
                    segment_id=f"s-{segment_idx}",
                    text=sent_text,
                    start_char=sent_start,
                    end_char=sent_end,
                ))
                segment_idx += 1

            last_end = sent_end

        # Handle last segment (if not ending with sentence punctuation)
        if last_end < len(content):
            remaining = content[last_end:]
            if remaining.strip():
                segments.append(Segment(
                    segment_id=f"s-{segment_idx}",
                    text=remaining,
                    start_char=last_end,
                    end_char=len(content),
                ))

        # If no sentence punctuation in entire content, treat as single segment
        if not segments:
            segments.append(Segment(
                segment_id="s-1",
                text=content,
                start_char=0,
                end_char=len(content),
            ))

        return Ring3Output(segments=segments)

    def get_metadata(self) -> ExtractorMetadata:
        """
        Return extractor metadata
        """
        return ExtractorMetadata(
            plugin="jieba",
            model="jieba",
            version=self.jieba_version,
            language=self.config.language,
            settings=self.config.settings or {},
        )
