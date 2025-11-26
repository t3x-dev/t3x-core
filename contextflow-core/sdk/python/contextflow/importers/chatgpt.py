"""ChatGPT importer"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from .base import BaseImporter, ImporterConfig
from ..types import ContextFlowFile, Conversation, Message, ContextFlowMetadata


class ChatGPTImporter(BaseImporter):
    """Import ChatGPT conversation exports to ContextFlow"""

    @property
    def name(self) -> str:
        return "chatgpt"

    @property
    def supported_formats(self) -> List[str]:
        return ["application/json"]

    def can_import(self, data: Any) -> bool:
        """Check if data is ChatGPT export format"""
        if isinstance(data, list):
            return any(
                isinstance(item, dict)
                and "mapping" in item
                and "title" in item
                and "create_time" in item
                for item in data
            )
        return False

    def import_data(
        self, input_data: Union[str, bytes], config: Optional[ImporterConfig] = None
    ) -> ContextFlowFile:
        """Import ChatGPT export to ContextFlow"""
        config = config or ImporterConfig()

        # Parse JSON
        if isinstance(input_data, bytes):
            input_data = input_data.decode("utf-8")
        data = json.loads(input_data)

        if not self.can_import(data):
            raise ValueError("Invalid ChatGPT export format")

        conversations: List[Conversation] = []

        for conv_data in data:
            messages = self._extract_messages(conv_data.get("mapping", {}))
            created_ts = conv_data.get("create_time")

            if messages:
                conversations.append(
                    Conversation(
                        id=str(uuid.uuid4()),
                        title=conv_data.get("title", "Untitled"),
                        created=self._format_timestamp(created_ts)
                        if created_ts is not None
                        else None,
                        source="chatgpt",
                        messages=messages,
                        tags=[*(config.tags or []), "chatgpt", "imported"],
                    )
                )

        now = datetime.now(timezone.utc)
        now_iso = self._format_datetime(now)

        return ContextFlowFile(
            contextflow_version="1.0",
            schema_="https://contextflow.dev/schema/v1.0.json",
            metadata=ContextFlowMetadata(
                id=str(uuid.uuid4()),
                created=now_iso,
                modified=now_iso,
                name="ChatGPT Import",
                description=f"Imported {len(conversations)} conversations from ChatGPT",
                tags=["chatgpt", "imported"],
            ),
            conversations=conversations,
        )

    def _extract_messages(self, mapping: Dict[str, Any]) -> List[Message]:
        """Extract messages from ChatGPT mapping structure"""
        messages: List[Message] = []

        for msg_id, msg_obj in mapping.items():
            if "message" in msg_obj and msg_obj["message"]:
                msg = msg_obj["message"]
                role = msg.get("author", {}).get("role")

                if role in ["user", "assistant"]:
                    content = "".join(msg.get("content", {}).get("parts", []))

                    if content.strip():
                        timestamp = msg.get("create_time")
                        messages.append(
                            Message(
                                role=role,
                                content=content,
                                timestamp=self._format_timestamp(timestamp)
                                if timestamp is not None
                                else None,
                            )
                        )

        # Sort by timestamp
        return sorted(messages, key=lambda m: m.timestamp or "")

    @staticmethod
    def _format_timestamp(raw_timestamp: Any) -> Optional[str]:
        """Convert a ChatGPT epoch timestamp to an ISO-8601 UTC string."""
        try:
            return ChatGPTImporter._format_datetime(
                datetime.fromtimestamp(float(raw_timestamp), tz=timezone.utc)
            )
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _format_datetime(dt: datetime) -> str:
        """Return ISO-8601 string with UTC designator."""
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
