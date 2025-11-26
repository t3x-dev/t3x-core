"""OpenAI exporter"""

from typing import Optional, Dict, Any, List
from .base import BaseExporter, ExporterConfig
from ..types import ContextFlowFile


class OpenAIExporter(BaseExporter):
    """Export ContextFlow to OpenAI Chat Completions format"""

    @property
    def name(self) -> str:
        return "openai"

    @property
    def output_format(self) -> str:
        return "application/json"

    def export(
        self, artifact: ContextFlowFile, config: Optional[ExporterConfig] = None
    ) -> Dict[str, Any]:
        """Export ContextFlow to OpenAI request format"""
        config = config or ExporterConfig()

        messages: List[Dict[str, str]] = []

        # Build system prompt from preferences and notes
        system_content = self._build_system_prompt(artifact, config)
        if system_content:
            messages.append({"role": "system", "content": system_content})

        # Add conversation history
        if config.include_conversations and artifact.conversations:
            conversations = artifact.conversations
            if config.max_conversations:
                conversations = conversations[-config.max_conversations :]

            for conv in conversations:
                for msg in conv.messages:
                    if msg.role in ["user", "assistant"]:
                        messages.append({"role": msg.role, "content": msg.content})

        # Build OpenAI request format
        return {
            "model": "gpt-4-turbo",
            "messages": messages,
            "temperature": 0.7,
        }

    def _build_system_prompt(self, artifact: ContextFlowFile, config: ExporterConfig) -> str:
        """Build system prompt from ContextFlow data"""
        sections = []

        # Add preferences
        if config.include_preferences and artifact.preferences:
            pref_lines = []

            if artifact.preferences.languages:
                pref_lines.append(
                    f"Preferred languages: {', '.join(artifact.preferences.languages)}"
                )

            if artifact.preferences.frameworks:
                pref_lines.append(
                    f"Preferred frameworks: {', '.join(artifact.preferences.frameworks)}"
                )

            if artifact.preferences.style:
                pref_lines.append(f"Coding style: {artifact.preferences.style}")

            if artifact.preferences.tone:
                pref_lines.append(f"Communication tone: {artifact.preferences.tone}")

            if pref_lines:
                sections.append("User Preferences:\n" + "\n".join(pref_lines))

        # Add notes/knowledge
        if config.include_notes and artifact.notes:
            note_lines = ["Knowledge Base:"]
            for note in artifact.notes:
                note_lines.append(f"- {note.title or 'Note'}: {note.content}")

            sections.append("\n".join(note_lines))

        return "\n\n".join(sections)
