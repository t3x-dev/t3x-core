"""
Bridge template system

Bridges connect conversation evidence with draft generation.
Each Bridge defines a specific writing style and prompt template.

Supported Bridge types:
- /plan: Planning-type drafts
- /explain: Concept explanation drafts
- /summary: Summary-type drafts
- /clarify: Clarification drafts
"""

from .loader import BridgeLoader, BridgeTemplate, BUILTIN_BRIDGES_DIR

__all__ = [
    "BridgeLoader",
    "BridgeTemplate",
    "BUILTIN_BRIDGES_DIR",
]
