"""Main ContextFlow SDK module."""

import json
from pathlib import Path
from typing import Any, Dict, Optional, Union

from .types import ContextFlowFile
from .importers import ImporterRegistry, ImporterConfig
from .exporters import ExporterRegistry, ExporterConfig
from .providers import BaseConnector, ConnectorConfig, ConnectorRegistry


class ContextFlow:
    """Main ContextFlow SDK class for loading, saving, importing, and exporting."""

    def __init__(self):
        self.importer_registry = ImporterRegistry()
        self.exporter_registry = ExporterRegistry()
        self.connector_registry = ConnectorRegistry()

    @staticmethod
    def load(file_path: str) -> ContextFlowFile:
        """Load a ContextFlow file."""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return ContextFlowFile(**data)

    @staticmethod
    def save(file_path: str, artifact: ContextFlowFile, pretty: bool = True):
        """Save a ContextFlow file."""
        # Ensure parent directory exists
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            if pretty:
                json.dump(artifact.model_dump(by_alias=True, exclude_none=True), f, indent=2)
            else:
                json.dump(artifact.model_dump(by_alias=True, exclude_none=True), f)

    def import_data(
        self,
        input_data: Union[str, bytes],
        importer_name: Optional[str] = None,
        config: Optional[ImporterConfig] = None,
    ) -> ContextFlowFile:
        """
        Import data to ContextFlow format.

        Args:
            input_data: Raw input data (JSON string or bytes)
            importer_name: Optional importer name. If not provided, auto-detect
            config: Optional importer configuration

        Returns:
            ContextFlowFile instance

        Raises:
            ValueError: If no suitable importer found or import fails
        """
        # Parse input if JSON
        if isinstance(input_data, (str, bytes)):
            try:
                parsed_data = json.loads(input_data)
            except json.JSONDecodeError:
                parsed_data = input_data
        else:
            parsed_data = input_data

        # Get or detect importer
        if importer_name:
            importer = self.importer_registry.get(importer_name)
            if not importer:
                raise ValueError(f"Importer '{importer_name}' not found")
        else:
            importer = self.importer_registry.detect(parsed_data)
            if not importer:
                raise ValueError("Could not auto-detect importer for input data")

        # Import
        return importer.import_data(input_data, config)

    def export_data(
        self,
        artifact: ContextFlowFile,
        exporter_name: str,
        config: Optional[ExporterConfig] = None,
    ) -> Union[str, dict]:
        """
        Export ContextFlow data to a target format.

        Args:
            artifact: ContextFlowFile instance
            exporter_name: Name of exporter to use
            config: Optional exporter configuration

        Returns:
            Exported data (string or dict depending on exporter)

        Raises:
            ValueError: If exporter not found
        """
        exporter = self.exporter_registry.get(exporter_name)
        if not exporter:
            raise ValueError(f"Exporter '{exporter_name}' not found")

        return exporter.export(artifact, config)

    def list_importers(self):
        """List available importers"""
        return self.importer_registry.list_importers()

    def list_exporters(self):
        """List available exporters"""
        return self.exporter_registry.list_exporters()

    def list_connectors(self):
        """List available connectors"""
        return self.connector_registry.list_connectors()

    def register_connector(self, connector: BaseConnector):
        """Register a new connector"""
        self.connector_registry.register(connector)

    def ingest_from_connector(
        self,
        connector_name: str,
        connector_config: Optional[Union[ConnectorConfig, Dict[str, Any]]] = None,
        importer_name: Optional[str] = None,
        importer_config: Optional[ImporterConfig] = None,
    ) -> ContextFlowFile:
        """
        Fetch conversations from a connector and convert them to ContextFlow.

        Args:
            connector_name: Name of the registered connector.
            connector_config: Configuration for the connector (model instance or dict).
            importer_name: Optional importer to use. Falls back to connector default.
            importer_config: Optional importer configuration.

        Returns:
            ContextFlowFile instance created from fetched payloads.

        Raises:
            ValueError: If the connector or importer cannot be found.
            ConnectorError: If the connector fails to fetch data.
        """
        connector = self.connector_registry.get(connector_name)
        if not connector:
            raise ValueError(f"Connector '{connector_name}' not found")

        payload = connector.fetch(connector_config)

        if isinstance(payload, ContextFlowFile):
            return payload

        resolved_importer = importer_name or connector.default_importer

        return self.import_data(payload, resolved_importer, importer_config)


# Convenience functions
def load(file_path: str) -> ContextFlowFile:
    """Load a ContextFlow file."""
    return ContextFlow.load(file_path)


def save(file_path: str, artifact: ContextFlowFile, pretty: bool = True):
    """Save a ContextFlow file."""
    ContextFlow.save(file_path, artifact, pretty)
