"""HTTP-based connector implementation."""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from urllib import request, error as urlerror
from urllib.parse import urlencode

from pydantic import Field, root_validator

from .base import BaseConnector, ConnectorConfig, ConnectorError


class HTTPConnectorConfig(ConnectorConfig):
    """Configuration specific to HTTP connectors."""

    method: str = Field(
        default="GET",
        description="HTTP method used for the request (GET or POST).",
    )
    body: Optional[Any] = Field(
        default=None,
        description="Optional request body for non-GET requests.",
    )
    content_type: str = Field(
        default="application/json",
        description="Content-Type header applied when serialising JSON bodies.",
    )

    @root_validator(pre=True)
    def _normalise_method(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        method = values.get("method")
        if method:
            values["method"] = method.upper()
        return values


class HTTPConversationConnector(BaseConnector):
    """Generic HTTP connector that retrieves conversation payloads from REST APIs."""

    name = "http"
    config_class = HTTPConnectorConfig

    def _fetch(self, config: HTTPConnectorConfig) -> str:
        url = config.resolve_endpoint()
        data: Optional[bytes] = None

        if config.method == "GET":
            if config.params:
                query = urlencode(config.params, doseq=True)
                url = f"{url}?{query}"
        else:
            data = self.prepare_body(config.body)
        headers = dict(config.headers)
        if data and "Content-Type" not in headers:
            headers["Content-Type"] = config.content_type
        if config.auth_token and "Authorization" not in headers:
            headers["Authorization"] = f"{config.auth_scheme} {config.auth_token}"

        req = request.Request(url, data=data, method=config.method, headers=headers)
        if data and "Content-Type" not in req.headers:
            req.headers["Content-Type"] = config.content_type

        try:
            with request.urlopen(req, timeout=config.timeout) as resp:
                raw = resp.read()
                charset = getattr(resp.headers, "get_content_charset", lambda: None)()
                encoding = charset or "utf-8"
                return raw.decode(encoding)
        except urlerror.HTTPError as exc:
            raise ConnectorError(
                f"HTTP {exc.code} error from {url}: {exc.reason}"
            ) from exc
        except urlerror.URLError as exc:
            raise ConnectorError(f"Failed to reach {url}: {exc.reason}") from exc
