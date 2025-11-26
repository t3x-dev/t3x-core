"""Claude exporter"""

from typing import Optional
from .base import BaseExporter, ExporterConfig
from ..types import ContextFlowFile


class ClaudeExporter(BaseExporter):
    """Export ContextFlow to Claude system prompt (Markdown)"""

    @property
    def name(self) -> str:
        return "claude"

    @property
    def output_format(self) -> str:
        return "text/markdown"

    def export(self, artifact: ContextFlowFile, config: Optional[ExporterConfig] = None) -> str:
        """Export ContextFlow to Claude-compatible Markdown system prompt"""
        config = config or ExporterConfig()

        sections = []

        # Add preferences
        if config.include_preferences and artifact.preferences:
            sections.append(self._format_preferences(artifact.preferences))

        # Add notes/knowledge
        if config.include_notes and artifact.notes:
            sections.append(self._format_notes(artifact.notes))

        # Add recent conversations
        if config.include_conversations and artifact.conversations:
            conversations = artifact.conversations
            if config.max_conversations:
                conversations = conversations[-config.max_conversations :]

            sections.append(self._format_conversations(conversations))

        return "\n\n".join(sections)

    def _format_preferences(self, preferences) -> str:
        """Format preferences as Markdown"""
        lines = ["# User Preferences"]

        if preferences.languages:
            lines.append(f"- **Languages**: {', '.join(preferences.languages)}")

        if preferences.frameworks:
            lines.append(f"- **Frameworks**: {', '.join(preferences.frameworks)}")

        if preferences.style:
            lines.append(f"- **Style**: {preferences.style}")

        if preferences.tone:
            lines.append(f"- **Tone**: {preferences.tone}")

        return "\n".join(lines)

    def _format_notes(self, notes) -> str:
        """Format notes as Markdown"""
        lines = ["# Knowledge Base"]

        for note in notes:
            lines.append(f"\n## {note.title or 'Untitled'}")
            lines.append(note.content)

        return "\n".join(lines)

    def _format_conversations(self, conversations) -> str:
        """Format conversations as Markdown"""
        lines = ["# Recent Conversations"]

        for conv in conversations:
            lines.append(f"\n## {conv.title or 'Untitled Conversation'}")
            if conv.created:
                lines.append(f"*Date: {conv.created}*")

            for msg in conv.messages:
                role_label = msg.role.capitalize()
                lines.append(f"\n**{role_label}**: {msg.content}")

        return "\n".join(lines)
