"""Connector registry and built-in implementations."""

from __future__ import annotations

from typing import Dict, List, Optional

from .base import BaseConnector, ConnectorConfig, ConnectorError
from .http import HTTPConversationConnector, HTTPConnectorConfig


class ConnectorRegistry:
    """Registry for managing upstream connectors."""

    def __init__(self):
        self._connectors: Dict[str, BaseConnector] = {}
        self._register_defaults()

    def _register_defaults(self):
        self.register(HTTPConversationConnector())

    def register(self, connector: BaseConnector):
        self._connectors[connector.name] = connector

    def get(self, name: str) -> Optional[BaseConnector]:
        return self._connectors.get(name)

    def list_connectors(self) -> List[str]:
        return list(self._connectors.keys())


__all__ = [
    "BaseConnector",
    "ConnectorConfig",
    "ConnectorError",
    "ConnectorRegistry",
    "HTTPConversationConnector",
    "HTTPConnectorConfig",
]

