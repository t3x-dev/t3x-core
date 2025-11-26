"""Exporter registry and implementations"""

from typing import Dict, List, Optional
from .base import BaseExporter, ExporterConfig
from .claude import ClaudeExporter
from .openai import OpenAIExporter


class ExporterRegistry:
    """Registry for managing exporters"""

    def __init__(self):
        self._exporters: Dict[str, BaseExporter] = {}
        self._register_default_exporters()

    def _register_default_exporters(self):
        """Register built-in exporters"""
        self.register(ClaudeExporter())
        self.register(OpenAIExporter())

    def register(self, exporter: BaseExporter):
        """Register a new exporter"""
        self._exporters[exporter.name] = exporter

    def get(self, name: str) -> Optional[BaseExporter]:
        """Get exporter by name"""
        return self._exporters.get(name)

    def list_exporters(self) -> List[str]:
        """List all registered exporter names"""
        return list(self._exporters.keys())


# Global registry instance
_default_registry = ExporterRegistry()


def get_exporter(name: str) -> Optional[BaseExporter]:
    """Get exporter by name from default registry"""
    return _default_registry.get(name)


def register_exporter(exporter: BaseExporter):
    """Register exporter to default registry"""
    _default_registry.register(exporter)


__all__ = [
    "BaseExporter",
    "ExporterConfig",
    "ClaudeExporter",
    "OpenAIExporter",
    "ExporterRegistry",
    "get_exporter",
    "register_exporter",
]
