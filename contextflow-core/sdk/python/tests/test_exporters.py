"""Tests for ContextFlow exporters"""

import pytest
from datetime import datetime
from contextflow.exporters import ClaudeExporter, OpenAIExporter, ExporterConfig
from contextflow.types import (
    ContextFlowFile,
    ContextFlowMetadata,
    Conversation,
    Message,
    Note,
    Preferences,
)


class TestClaudeExporter:
    """Test Claude exporter functionality"""

    def setup_method(self):
        """Setup test fixtures"""
        self.exporter = ClaudeExporter()

    def test_export_minimal_contextflow(self):
        """Test exporting minimal ContextFlow to Claude format"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
        )

        result = self.exporter.export(artifact)

        # Should return a string (Markdown)
        assert isinstance(result, str)

    def test_export_with_preferences(self):
        """Test exporting ContextFlow with preferences"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            preferences=Preferences(
                languages=["python", "javascript"],
                frameworks=["fastapi", "react"],
                style="concise and clear",
                tone="professional",
            ),
        )

        result = self.exporter.export(artifact)

        # Verify preferences are included
        assert "User Preferences" in result
        assert "python" in result
        assert "javascript" in result
        assert "fastapi" in result
        assert "concise and clear" in result

    def test_export_with_notes(self):
        """Test exporting ContextFlow with notes"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            notes=[
                Note(
                    title="Important Note",
                    content="This is important knowledge",
                    type="text/markdown",
                )
            ],
        )

        result = self.exporter.export(artifact)

        # Verify notes are included
        assert "Knowledge Base" in result
        assert "Important Note" in result
        assert "important knowledge" in result

    def test_export_with_conversations(self):
        """Test exporting ContextFlow with conversations"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            conversations=[
                Conversation(
                    title="Test Chat",
                    messages=[
                        Message(role="user", content="Hello"),
                        Message(role="assistant", content="Hi there!"),
                    ],
                )
            ],
        )

        result = self.exporter.export(artifact)

        # Verify conversations are included
        assert "Recent Conversations" in result
        assert "Test Chat" in result
        assert "User" in result or "**user**" in result.lower()
        assert "Hello" in result
        assert "Hi there!" in result

    def test_export_max_conversations_limit(self):
        """Test limiting number of conversations in export"""
        conversations = [
            Conversation(
                title=f"Chat {i}",
                messages=[Message(role="user", content=f"Message {i}")],
            )
            for i in range(10)
        ]

        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            conversations=conversations,
        )

        config = ExporterConfig(max_conversations=3)
        result = self.exporter.export(artifact, config)

        # Should only include last 3 conversations
        assert "Chat 7" in result
        assert "Chat 8" in result
        assert "Chat 9" in result
        assert "Chat 0" not in result

    def test_export_exclude_sections(self):
        """Test excluding specific sections from export"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            preferences=Preferences(languages=["python"]),
            notes=[Note(title="Note", content="Content", type="text/markdown")],
            conversations=[
                Conversation(
                    title="Chat", messages=[Message(role="user", content="Hi")]
                )
            ],
        )

        # Exclude notes and preferences
        config = ExporterConfig(include_notes=False, include_preferences=False)
        result = self.exporter.export(artifact, config)

        # Should only have conversations
        assert "Recent Conversations" in result
        assert "Knowledge Base" not in result
        assert "User Preferences" not in result


class TestOpenAIExporter:
    """Test OpenAI exporter functionality"""

    def setup_method(self):
        """Setup test fixtures"""
        self.exporter = OpenAIExporter()

    def test_export_minimal_contextflow(self):
        """Test exporting minimal ContextFlow to OpenAI format"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
        )

        result = self.exporter.export(artifact)

        # Should return a dict with OpenAI request format
        assert isinstance(result, dict)
        assert "model" in result
        assert "messages" in result
        assert "temperature" in result

    def test_export_creates_system_prompt(self):
        """Test that preferences/notes become system prompt"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            preferences=Preferences(languages=["python"]),
            notes=[Note(title="Tip", content="Use type hints", type="text/markdown")],
        )

        result = self.exporter.export(artifact)

        # Should have system message
        messages = result["messages"]
        assert len(messages) > 0
        assert messages[0]["role"] == "system"
        assert "python" in messages[0]["content"]
        assert "type hints" in messages[0]["content"]

    def test_export_includes_conversation_messages(self):
        """Test that conversation messages are included"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            conversations=[
                Conversation(
                    title="Chat",
                    messages=[
                        Message(role="user", content="Hello"),
                        Message(role="assistant", content="Hi!"),
                        Message(role="user", content="How are you?"),
                    ],
                )
            ],
        )

        result = self.exporter.export(artifact)

        messages = result["messages"]
        # Should have all messages (possibly with system prompt)
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        assert len(user_msgs) == 2
        assert len(assistant_msgs) == 1
        assert user_msgs[0]["content"] == "Hello"
        assert assistant_msgs[0]["content"] == "Hi!"

    def test_export_max_conversations_limit(self):
        """Test limiting conversations in export"""
        conversations = [
            Conversation(
                title=f"Chat {i}",
                messages=[Message(role="user", content=f"Message {i}")],
            )
            for i in range(5)
        ]

        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            conversations=conversations,
        )

        config = ExporterConfig(max_conversations=2)
        result = self.exporter.export(artifact, config)

        # Should only have messages from last 2 conversations
        messages = result["messages"]
        contents = [m["content"] for m in messages]
        combined = " ".join(contents)

        assert "Message 3" in combined
        assert "Message 4" in combined
        assert "Message 0" not in combined

    def test_export_filters_system_messages(self):
        """Test that system messages are not duplicated"""
        artifact = ContextFlowFile(
            contextflow_version="1.0",
            metadata=ContextFlowMetadata(created="2025-10-06T12:00:00Z"),
            conversations=[
                Conversation(
                    messages=[
                        Message(role="system", content="System prompt"),  # Should be filtered
                        Message(role="user", content="Hello"),
                    ]
                )
            ],
        )

        result = self.exporter.export(artifact)

        # System messages from conversations should not appear
        # (only the built system prompt from preferences/notes)
        messages = result["messages"]
        user_msgs = [m for m in messages if m["role"] == "user"]
        assert len(user_msgs) == 1


class TestExporterConfig:
    """Test exporter configuration"""

    def test_default_config(self):
        """Test default configuration values"""
        config = ExporterConfig()

        assert config.include_conversations is True
        assert config.include_notes is True
        assert config.include_preferences is True
        assert config.max_conversations is None

    def test_custom_config(self):
        """Test custom configuration"""
        config = ExporterConfig(
            include_conversations=False,
            max_conversations=5,
            tags=["important"],
        )

        assert config.include_conversations is False
        assert config.max_conversations == 5
        assert config.tags == ["important"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
