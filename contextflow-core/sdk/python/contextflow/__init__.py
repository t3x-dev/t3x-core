"""
ContextFlow SDK - Official Python SDK for the ContextFlow specification.
"""

from .contextflow import ContextFlow, load, save
from .types import (
    ContextFlowFile,
    ContextFlowMetadata,
    Conversation,
    Message,
    Note,
    Preferences,
    APICallMetadata,
    UsageSummary,
)
from .importers import BaseImporter, ImporterRegistry, ChatGPTImporter
from .exporters import BaseExporter, ExporterRegistry, ClaudeExporter, OpenAIExporter
from .providers import (
    BaseConnector,
    ConnectorConfig,
    ConnectorRegistry,
    ConnectorError,
    HTTPConversationConnector,
    HTTPConnectorConfig,
)

__version__ = "0.1.0"

__all__ = [
    "ContextFlow",
    "load",
    "save",
    "ContextFlowFile",
    "ContextFlowMetadata",
    "Conversation",
    "Message",
    "Note",
    "Preferences",
    "APICallMetadata",
    "UsageSummary",
    "BaseImporter",
    "ImporterRegistry",
    "ChatGPTImporter",
    "BaseExporter",
    "ExporterRegistry",
    "ClaudeExporter",
    "OpenAIExporter",
    "BaseConnector",
    "ConnectorConfig",
    "ConnectorRegistry",
    "ConnectorError",
    "HTTPConversationConnector",
    "HTTPConnectorConfig",
]
