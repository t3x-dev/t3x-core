"""
Ring 1/2/3 extractor module

Implemented according to ARCHITECTURE.zh.md specification:
- Ring 1: Keywords, entities, time, preference labels (lemmatization + polarity annotation)
- Ring 2: Lightweight relations / Facets (intent seed, time window, soft preferences, unknown slots)
- Ring 3: Sentence structure (sentence-level segments)

All extractors must be:
1. Deterministic (same input → same output)
2. Pluggable (unified interface)
3. Configurable (YAML/JSON configuration)
"""

from .base import ExtractorConfig, ExtractorMetadata, ExtractorPlugin
from .ring_extractor import RingExtractor
from .polarity_rules import PolarityRuleEngine

# JiebaExtractor is optional (requires jieba dependency)
try:
    from .jieba_extractor import JiebaExtractor
    JIEBA_AVAILABLE = True
except ImportError:
    JiebaExtractor = None
    JIEBA_AVAILABLE = False

__all__ = [
    "ExtractorConfig",
    "ExtractorMetadata",
    "ExtractorPlugin",
    "RingExtractor",
    "JiebaExtractor",
    "JIEBA_AVAILABLE",
    "PolarityRuleEngine",
]
