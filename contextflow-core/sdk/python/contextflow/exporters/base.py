"""Base exporter interface"""

from abc import ABC, abstractmethod
from typing import Any, List, Optional, Union
from pydantic import BaseModel

from ..types import ContextFlowFile


class ExporterConfig(BaseModel):
    """Configuration for exporters"""

    include_conversations: bool = True
    include_notes: bool = True
    include_preferences: bool = True
    max_conversations: Optional[int] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    tags: Optional[List[str]] = None


class BaseExporter(ABC):
    """Base class for all exporters"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Exporter name"""
        pass

    @property
    @abstractmethod
    def output_format(self) -> str:
        """Output format (e.g., 'text/markdown', 'application/json')"""
        pass

    @abstractmethod
    def export(
        self, artifact: ContextFlowFile, config: Optional[ExporterConfig] = None
    ) -> Union[str, dict]:
        """Export ContextFlow to target format."""
        pass

    def get_metadata(self) -> dict:
        """Get exporter metadata"""
        return {
            "name": self.name,
            "output_format": self.output_format,
        }
