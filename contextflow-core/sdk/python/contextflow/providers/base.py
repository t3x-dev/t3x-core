"""Connector abstractions for retrieving conversation data from upstream systems."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Type, TypeVar, Union
from urllib.parse import urljoin

from pydantic import BaseModel, Field, validator


class ConnectorError(Exception):
    """Domain-specific error raised when connector operations fail."""


class ConnectorConfig(BaseModel):
    """Base configuration shared by connectors."""

    base_url: str = Field(..., description="Root URL of the upstream API service.")
    endpoint: str = Field(
        "/conversations",
        description="Endpoint path to fetch conversation payloads.",
    )
    headers: Dict[str, str] = Field(
        default_factory=dict, description="Additional HTTP headers to send."
    )
    params: Dict[str, Any] = Field(
        default_factory=dict,
        description="Query string parameters for GET requests.",
    )
    auth_token: Optional[str] = Field(
        default=None, description="Token appended to Authorization header."
    )
    auth_scheme: str = Field(
        default="Bearer", description="Authorization scheme used with auth_token."
    )
    timeout: float = Field(
        default=10.0, description="Request timeout (seconds) for network calls."
    )

    @validator("base_url")
    def _validate_base_url(cls, value: str) -> str:
        if not value:
            raise ValueError("base_url cannot be empty")
        return value

    def resolve_endpoint(self) -> str:
        """Return the fully qualified URL for the configured endpoint."""
        prefix = self.base_url.rstrip("/") + "/"
        path = self.endpoint.lstrip("/")
        return urljoin(prefix, path)


ConfigT = TypeVar("ConfigT", bound=ConnectorConfig)


class BaseConnector(ABC):
    """Abstract base class implemented by all upstream connectors."""

    name: str
    config_class: Type[ConfigT] = ConnectorConfig
    default_importer: Optional[str] = None

    def fetch(self, config: Union[ConfigT, Dict[str, Any], None]) -> Any:
        """
        Fetch raw payloads using connector-specific logic.

        The configuration may be provided as a pydantic model instance or raw dict.
        """
        config_obj = self._coerce_config(config)
        return self._fetch(config_obj)

    def _coerce_config(self, config: Union[ConfigT, Dict[str, Any], None]) -> ConfigT:
        """Normalise configuration into the connector's config class."""
        if config is None:
            raise ConnectorError(
                f"Connector '{self.name}' requires configuration but none was provided"
            )

        if isinstance(config, self.config_class):
            return config

        if isinstance(config, dict):
            return self.config_class(**config)

        raise ConnectorError(
            f"Unsupported config type for connector '{self.name}': {type(config)}"
        )

    @abstractmethod
    def _fetch(self, config: ConfigT) -> Any:
        """Concrete connectors implement this to return raw conversation payloads."""

    def prepare_body(self, body: Any) -> bytes:
        """
        Utility helper to encode request bodies.

        Accepts bytes, strings, or serialisable objects. Serialises to JSON by default.
        """
        if body is None:
            return b""

        if isinstance(body, bytes):
            return body

        if isinstance(body, str):
            return body.encode("utf-8")

        return json.dumps(body).encode("utf-8")

