"""Base importer interface"""

from abc import ABC, abstractmethod
from typing import Any, List, Optional, Union
from pydantic import BaseModel

from ..types import ContextFlowFile


class ImporterConfig(BaseModel):
    preserve_metadata: bool = True
    auto_extract_knowledge: bool = False
    tags: Optional[List[str]] = None


class BaseImporter(ABC):
    """Base class for all importers"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Importer name"""
        pass

    @property
    @abstractmethod
    def supported_formats(self) -> List[str]:
        """Supported MIME types"""
        pass

    @abstractmethod
    def can_import(self, data: Any) -> bool:
        """Check if this importer can handle the input data"""
        pass

    @abstractmethod
    def import_data(
        self, input_data: Union[str, bytes], config: Optional[ImporterConfig] = None
    ) -> ContextFlowFile:
        """Import data to ContextFlow format"""
        pass

    def get_metadata(self) -> dict:
        """Get importer metadata"""
        return {
            "name": self.name,
            "supported_formats": self.supported_formats,
        }
