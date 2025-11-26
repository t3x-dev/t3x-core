"""Importer registry and implementations"""

from typing import Any, Dict, Optional, List
from .base import BaseImporter, ImporterConfig
from .chatgpt import ChatGPTImporter


class ImporterRegistry:
    """Registry for managing and auto-detecting importers"""

    def __init__(self):
        self._importers: Dict[str, BaseImporter] = {}
        self._register_default_importers()

    def _register_default_importers(self):
        """Register built-in importers"""
        self.register(ChatGPTImporter())

    def register(self, importer: BaseImporter):
        """Register a new importer"""
        self._importers[importer.name] = importer

    def get(self, name: str) -> Optional[BaseImporter]:
        """Get importer by name"""
        return self._importers.get(name)

    def list_importers(self) -> List[str]:
        """List all registered importer names"""
        return list(self._importers.keys())

    def detect(self, data: Any) -> Optional[BaseImporter]:
        """Auto-detect which importer can handle the data"""
        for importer in self._importers.values():
            if importer.can_import(data):
                return importer
        return None


# Global registry instance
_default_registry = ImporterRegistry()


def get_importer(name: str) -> Optional[BaseImporter]:
    """Get importer by name from default registry"""
    return _default_registry.get(name)


def detect_importer(data: Any) -> Optional[BaseImporter]:
    """Auto-detect importer from default registry"""
    return _default_registry.detect(data)


def register_importer(importer: BaseImporter):
    """Register importer to default registry"""
    _default_registry.register(importer)


__all__ = [
    "BaseImporter",
    "ImporterConfig",
    "ChatGPTImporter",
    "ImporterRegistry",
    "get_importer",
    "detect_importer",
    "register_importer",
]
