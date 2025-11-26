"""Tests for ContextFlow importers"""

import pytest
import json
from contextflow.importers import ChatGPTImporter, ImporterConfig, ImporterRegistry


class TestChatGPTImporter:
    """Test ChatGPT importer functionality"""

    def setup_method(self):
        """Setup test fixtures"""
        self.importer = ChatGPTImporter()

    def test_can_import_chatgpt_format(self):
        """Test detection of valid ChatGPT export"""
        data = [
            {
                "title": "Test Conversation",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Hello"]},
                            "create_time": 1633024800.0,
                        }
                    }
                },
            }
        ]

        assert self.importer.can_import(data) is True

    def test_cannot_import_invalid_format(self):
        """Test rejection of invalid format"""
        # Not a list
        assert self.importer.can_import({"invalid": "data"}) is False

        # Empty list
        assert self.importer.can_import([]) is False

        # Missing required fields
        assert self.importer.can_import([{"title": "Test"}]) is False

    def test_import_simple_conversation(self):
        """Test importing a simple ChatGPT conversation"""
        chatgpt_data = [
            {
                "title": "Python Help",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["How do I use Python?"]},
                            "create_time": 1633024800.0,
                        }
                    },
                    "msg2": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Python is a programming language..."]},
                            "create_time": 1633024805.0,
                        }
                    },
                },
            }
        ]

        artifact = self.importer.import_data(json.dumps(chatgpt_data))

        # Verify ContextFlow structure
        assert artifact.contextflow_version == "1.0"
        assert artifact.metadata is not None
        assert len(artifact.conversations) == 1

        # Verify conversation
        conv = artifact.conversations[0]
        assert conv.title == "Python Help"
        assert conv.source == "chatgpt"
        assert len(conv.messages) == 2

        # Verify messages
        assert conv.messages[0].role == "user"
        assert "Python" in conv.messages[0].content
        assert conv.messages[1].role == "assistant"

    def test_import_with_config(self):
        """Test importing with configuration"""
        chatgpt_data = [
            {
                "title": "Test",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Test"]},
                            "create_time": 1633024800.0,
                        }
                    }
                },
            }
        ]

        config = ImporterConfig(tags=["work", "python"])
        artifact = self.importer.import_data(json.dumps(chatgpt_data), config)

        # Verify tags were added
        conv = artifact.conversations[0]
        assert "work" in conv.tags
        assert "python" in conv.tags
        assert "chatgpt" in conv.tags  # Importer also adds this

    def test_import_multiple_conversations(self):
        """Test importing multiple conversations"""
        chatgpt_data = [
            {
                "title": "Conversation 1",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Hello 1"]},
                            "create_time": 1633024800.0,
                        }
                    }
                },
            },
            {
                "title": "Conversation 2",
                "create_time": 1633024900.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Hello 2"]},
                            "create_time": 1633024900.0,
                        }
                    }
                },
            },
        ]

        artifact = self.importer.import_data(json.dumps(chatgpt_data))
        assert len(artifact.conversations) == 2
        assert artifact.conversations[0].title == "Conversation 1"
        assert artifact.conversations[1].title == "Conversation 2"

    def test_import_filters_system_messages(self):
        """Test that non-user/assistant messages are filtered"""
        chatgpt_data = [
            {
                "title": "Test",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["User message"]},
                            "create_time": 1633024800.0,
                        }
                    },
                    "msg2": {
                        "message": {
                            "author": {"role": "system"},  # System message
                            "content": {"parts": ["System message"]},
                            "create_time": 1633024801.0,
                        }
                    },
                    "msg3": {
                        "message": {
                            "author": {"role": "assistant"},
                            "content": {"parts": ["Assistant message"]},
                            "create_time": 1633024802.0,
                        }
                    },
                },
            }
        ]

        artifact = self.importer.import_data(json.dumps(chatgpt_data))

        # Should only have user and assistant messages
        assert len(artifact.conversations[0].messages) == 2
        assert artifact.conversations[0].messages[0].role == "user"
        assert artifact.conversations[0].messages[1].role == "assistant"

    def test_import_handles_empty_content(self):
        """Test that empty messages are filtered out"""
        chatgpt_data = [
            {
                "title": "Test",
                "create_time": 1633024800.0,
                "mapping": {
                    "msg1": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": [""]},  # Empty content
                            "create_time": 1633024800.0,
                        }
                    },
                    "msg2": {
                        "message": {
                            "author": {"role": "user"},
                            "content": {"parts": ["Real message"]},
                            "create_time": 1633024801.0,
                        }
                    },
                },
            }
        ]

        artifact = self.importer.import_data(json.dumps(chatgpt_data))

        # Should only have non-empty message
        assert len(artifact.conversations[0].messages) == 1
        assert artifact.conversations[0].messages[0].content == "Real message"


class TestImporterRegistry:
    """Test importer registry functionality"""

    def test_registry_has_default_importers(self):
        """Test that registry includes default importers"""
        registry = ImporterRegistry()
        importers = registry.list_importers()

        assert "chatgpt" in importers

    def test_get_importer_by_name(self):
        """Test getting importer by name"""
        registry = ImporterRegistry()
        importer = registry.get("chatgpt")

        assert importer is not None
        assert importer.name == "chatgpt"

    def test_detect_chatgpt_format(self):
        """Test auto-detection of ChatGPT format"""
        registry = ImporterRegistry()

        chatgpt_data = [
            {
                "title": "Test",
                "create_time": 1633024800.0,
                "mapping": {"msg1": {"message": {}}},
            }
        ]

        importer = registry.detect(chatgpt_data)
        assert importer is not None
        assert importer.name == "chatgpt"

    def test_detect_returns_none_for_unknown(self):
        """Test that unknown format returns None"""
        registry = ImporterRegistry()

        unknown_data = {"unknown": "format"}
        importer = registry.detect(unknown_data)

        assert importer is None

    def test_register_custom_importer(self):
        """Test registering a custom importer"""
        from contextflow.importers import BaseImporter
        from contextflow import ContextFlowFile, ContextFlowMetadata

        class CustomImporter(BaseImporter):
            @property
            def name(self):
                return "custom"

            @property
            def supported_formats(self):
                return ["application/json"]

            def can_import(self, data):
                return isinstance(data, dict) and "custom_field" in data

            def import_data(self, input_data, config=None):
                return ContextFlowFile(
                    contextflow_version="1.0",
                    metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
                )

        registry = ImporterRegistry()
        custom = CustomImporter()
        registry.register(custom)

        # Verify registration
        assert "custom" in registry.list_importers()
        assert registry.get("custom") == custom

        # Verify detection
        custom_data = {"custom_field": "value"}
        detected = registry.detect(custom_data)
        assert detected == custom


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
