#!/usr/bin/env python3
"""
Example: Creating ContextFlow files from scratch

This script shows different ways to craft ContextFlow artifacts locally without
talking to any external API.
"""

import json
from datetime import datetime


def create_minimal_contextflow() -> None:
    """Create the absolute minimal valid ContextFlow file."""
    artifact = {
        "contextflow_version": "1.0",
        "metadata": {
            "created": datetime.utcnow().isoformat() + "Z",
        },
    }

    with open("minimal.contextflow", "w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)

    print("✓ Created minimal.contextflow")


def create_project_context_contextflow() -> None:
    """Create a project-scoped ContextFlow artifact with richer content."""
    artifact = {
        "contextflow_version": "1.0",
        "$schema": "https://contextflow.dev/schema/v1.0.json",
        "metadata": {
            "created": datetime.utcnow().isoformat() + "Z",
            "name": "My Python Project",
            "description": "Context for my FastAPI application",
            "tags": ["python", "fastapi", "work"],
        },
        "conversations": [
            {
                "id": "conv-001",
                "title": "Initial Planning",
                "created": datetime.utcnow().isoformat() + "Z",
                "source": "manual",
                "messages": [
                    {
                        "role": "user",
                        "content": "I want to build a REST API for user management",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    },
                    {
                        "role": "assistant",
                        "content": "Great! Let's use FastAPI with SQLAlchemy. Here's the structure...",
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    },
                ],
                "tags": ["planning", "architecture"],
            }
        ],
        "notes": [
            {
                "id": "note-001",
                "title": "Project Preferences",
                "content": "- Use async/await for all endpoints\n- PostgreSQL for database\n- Pydantic for validation",
                "type": "text/markdown",
                "created": datetime.utcnow().isoformat() + "Z",
                "tags": ["preferences"],
            }
        ],
        "preferences": {
            "languages": ["python"],
            "frameworks": ["fastapi", "sqlalchemy"],
            "style": "async-first, type-annotated",
            "tone": "concise and practical",
        },
    }

    with open("project-context.contextflow", "w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)

    print("✓ Created project-context.contextflow")


def create_with_sdk() -> None:
    """Create a ContextFlow artifact using the Python SDK."""
    try:
        from contextflow import (
            ContextFlowFile,
            ContextFlowMetadata,
            Conversation,
            Message,
            Note,
            Preferences,
            save,
        )
    except ImportError:
        print("⚠ SDK not installed. Install with: pip install -e sdk/python")
        return

    artifact = ContextFlowFile(
        contextflow_version="1.0",
        metadata=ContextFlowMetadata(
            created=datetime.utcnow().isoformat() + "Z",
            name="Learning Context",
            description="Notes from learning Python async",
            tags=["learning", "python", "async"],
        ),
        conversations=[
            Conversation(
                title="Async/Await Discussion",
                messages=[
                    Message(
                        role="user",
                        content="How does async/await work in Python?",
                        timestamp=datetime.utcnow().isoformat() + "Z",
                    ),
                    Message(
                        role="assistant",
                        content="Async/await in Python allows concurrent execution...",
                        timestamp=datetime.utcnow().isoformat() + "Z",
                    ),
                ],
                tags=["async", "learning"],
            )
        ],
        notes=[
            Note(
                title="Key Concepts",
                content="# Async in Python\n\n- event loop\n- coroutines\n- tasks",
                type="text/markdown",
                tags=["concepts"],
            )
        ],
        preferences=Preferences(
            languages=["python"],
            style="detailed explanations with examples",
        ),
    )

    save("learning-context.contextflow", artifact)
    print("✓ Created learning-context.contextflow (using SDK)")


def import_from_chatgpt() -> None:
    """Example of importing from a ChatGPT-style export."""
    chatgpt_data = [
        {
            "title": "Python Help",
            "create_time": 1633024800.0,
            "mapping": {
                "msg1": {
                    "message": {
                        "author": {"role": "user"},
                        "content": {"parts": ["How do I use list comprehensions?"]},
                        "create_time": 1633024800.0,
                    }
                },
                "msg2": {
                    "message": {
                        "author": {"role": "assistant"},
                        "content": {"parts": ["List comprehensions in Python..."]},
                        "create_time": 1633024805.0,
                    }
                },
            },
        }
    ]

    artifact = {
        "contextflow_version": "1.0",
        "metadata": {
            "created": datetime.utcnow().isoformat() + "Z",
            "name": "ChatGPT Import",
            "description": "Imported conversations from ChatGPT",
            "tags": ["chatgpt", "imported"],
        },
        "conversations": [],
    }

    for conversation in chatgpt_data:
        messages = []
        for mapping_entry in conversation["mapping"].values():
            message = mapping_entry.get("message")
            if not message:
                continue

            role = message.get("author", {}).get("role")
            if role not in {"user", "assistant"}:
                continue

            messages.append(
                {
                    "role": role,
                    "content": "".join(message.get("content", {}).get("parts", [])),
                    "timestamp": datetime.fromtimestamp(
                        message.get("create_time", 0)
                    ).isoformat()
                    + "Z",
                }
            )

        artifact["conversations"].append(
            {
                "title": conversation["title"],
                "created": datetime.fromtimestamp(
                    conversation["create_time"]
                ).isoformat()
                + "Z",
                "source": "chatgpt",
                "messages": messages,
                "tags": ["chatgpt"],
            }
        )

    with open("chatgpt-imported.contextflow", "w", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2)

    print("✓ Created chatgpt-imported.contextflow")


if __name__ == "__main__":
    print("Creating ContextFlow files...\n")

    create_minimal_contextflow()
    create_project_context_contextflow()
    create_with_sdk()
    import_from_chatgpt()

    print("\n✓ All examples created!")
    print("\nValidate them with:")
    print("  contextflow validate minimal.contextflow")
    print("  contextflow validate project-context.contextflow")
