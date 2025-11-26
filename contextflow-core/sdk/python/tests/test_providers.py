"""Tests for connector configuration and HTTP connector behaviour."""

import json
from typing import Any

import pytest

from contextflow import ContextFlow
from contextflow.providers import (
    ConnectorConfig,
    HTTPConnectorConfig,
    HTTPConversationConnector,
    ConnectorError,
)


from typing import Optional, Dict


class DummyHeaders:
    """Simple headers stub with optional charset."""

    def __init__(self, charset: Optional[str] = None):
        self._charset = charset

    def get_content_charset(self) -> Optional[str]:
        return self._charset


class DummyResponse:
    """Context manager stub mirroring urllib responses."""

    def __init__(self, payload: str, charset: Optional[str] = "utf-8"):
        self._payload = payload.encode(charset or "utf-8")
        self.headers = DummyHeaders(charset)

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class TestConnectorConfig:
    """Unit tests for configuration helpers."""

    def test_resolve_endpoint(self):
        config = ConnectorConfig(base_url="https://api.example.com", endpoint="/v1/foo")
        assert config.resolve_endpoint() == "https://api.example.com/v1/foo"

    def test_missing_base_url(self):
        with pytest.raises(ValueError):
            ConnectorConfig(base_url="", endpoint="/foo")


class TestHTTPConversationConnector:
    """HTTP connector interaction tests."""

    def setup_method(self):
        self.connector = HTTPConversationConnector()

    def test_fetch_get_request(self, monkeypatch):
        expected_url = "https://api.example.com/v1/conversations?foo=bar"
        captured: dict[str, Any] = {}

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["headers"] = dict(req.headers)
            assert timeout == 5.0
            return DummyResponse('[{"id": "test"}]')

        monkeypatch.setattr(
            "contextflow.providers.http.request.urlopen", fake_urlopen, raising=True
        )

        config = HTTPConnectorConfig(
            base_url="https://api.example.com",
            endpoint="/v1/conversations",
            params={"foo": "bar"},
            timeout=5.0,
            auth_token="token-123",
        )

        payload = self.connector.fetch(config)

        assert payload == '[{"id": "test"}]'
        assert captured["url"] == expected_url
        assert captured["headers"]["Authorization"] == "Bearer token-123"

    def test_fetch_post_request(self, monkeypatch):
        captured: dict[str, Any] = {}

        def fake_urlopen(req, timeout):
            captured["url"] = req.full_url
            captured["headers"] = dict(req.headers)
            captured["data"] = req.data
            return DummyResponse("{}", charset="utf-8")

        monkeypatch.setattr(
            "contextflow.providers.http.request.urlopen", fake_urlopen, raising=True
        )

        config = HTTPConnectorConfig(
            base_url="https://api.example.com",
            endpoint="/ingest",
            method="POST",
            body={"hello": "world"},
        )

        _ = self.connector.fetch(config)

        assert captured["url"] == "https://api.example.com/ingest"
        assert json.loads(captured["data"].decode("utf-8")) == {"hello": "world"}
        assert captured["headers"]["Content-Type"] == "application/json"

    def test_missing_config_raises(self):
        with pytest.raises(ConnectorError):
            self.connector.fetch(None)


class TestContextFlowConnectorIntegration:
    """Integration test for ContextFlow ingest loop."""

    def test_ingest_from_http_connector(self, monkeypatch):
        client = ContextFlow()

        chatgpt_payload = [
            {
                "title": "Trip Planning",
                "create_time": 1700000000.0,
                "mapping": {
                    "node-1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Plan a trip to Osaka"]},
                            "create_time": 1700000000.0,
                        }
                    },
                    "node-2": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {
                                "parts": ["Sure, let's gather requirements."]
                            },
                            "create_time": 1700000005.0,
                        }
                    },
                },
            }
        ]

        payload_str = json.dumps(chatgpt_payload)

        def fake_urlopen(req, timeout):
            return DummyResponse(payload_str)

        monkeypatch.setattr(
            "contextflow.providers.http.request.urlopen", fake_urlopen, raising=True
        )

        artifact = client.ingest_from_connector(
            "http",
            connector_config={
                "base_url": "https://api.example.com",
                "endpoint": "/exports/chatgpt",
            },
            importer_name="chatgpt",
        )

        assert len(artifact.conversations) == 1
        conversation = artifact.conversations[0]
        assert conversation.title == "Trip Planning"
        assert conversation.source == "chatgpt"
        assert len(conversation.messages) == 2
