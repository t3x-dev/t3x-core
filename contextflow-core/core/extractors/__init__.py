"""
Ring 1/2/3 提取器模块

按照 ARCHITECTURE.zh.md 规范实现：
- Ring 1: 关键词、实体、时间、偏好标签（词形归一 + 极性标注）
- Ring 2: 轻关系 / Facet（intent seed、时间窗口、软偏好、未知槽位）
- Ring 3: 分句结构（句级片段）

所有提取器必须：
1. 决定论（同输入同输出）
2. 可插拔（统一接口）
3. 可配置（YAML/JSON 配置）
"""

from .base import ExtractorConfig, ExtractorMetadata, ExtractorPlugin
from .ring_extractor import RingExtractor
from .polarity_rules import PolarityRuleEngine

# JiebaExtractor 是可选的（需要 jieba 依赖）
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
