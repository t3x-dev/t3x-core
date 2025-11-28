"""
Chat API Routes

Provides streaming chat endpoints for CLI and WebUI integration.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.llm import ChatMessage as LLMChatMessage
from core.llm import LLMConfig, get_provider


router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class ChatMessageRequest(BaseModel):
    """A single message in the chat."""
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    """Chat request body."""
    messages: List[ChatMessageRequest]
    provider: str = "claude"
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    # Optional: link to project/conversation for auto-saving turns
    project_id: Optional[str] = None
    conversation_id: Optional[str] = None
    save_turns: bool = False  # Whether to auto-save turns to ledger


class ChatResponse(BaseModel):
    """Non-streaming chat response."""
    content: str
    model: str
    usage: Optional[dict] = None
    finish_reason: Optional[str] = None


class ProvidersResponse(BaseModel):
    """Available providers response."""
    providers: List[str]
    default: str


# ============================================================================
# Helper Functions
# ============================================================================

def _get_api_key_for_provider(provider: str) -> Optional[str]:
    """Get API key for provider from environment."""
    env_vars = {
        "claude": "ANTHROPIC_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "gpt": "OPENAI_API_KEY",
    }
    env_var = env_vars.get(provider.lower())
    if env_var:
        return os.environ.get(env_var)
    return None


def _get_default_model(provider: str) -> str:
    """Get default model for provider."""
    defaults = {
        "claude": "claude-sonnet-4-5-20250929",
        "anthropic": "claude-sonnet-4-5-20250929",
        "openai": "gpt-4o-mini",
        "gpt": "gpt-4o-mini",
    }
    return defaults.get(provider.lower(), "")


def _infer_provider_from_model(model: str) -> str:
    """Infer provider from model name."""
    model_lower = model.lower()

    # Claude models
    if model_lower.startswith("claude") or "anthropic" in model_lower:
        return "claude"

    # OpenAI models
    if model_lower.startswith("gpt") or model_lower.startswith("o1") or "openai" in model_lower:
        return "openai"

    # Default to claude
    return "claude"


def _convert_messages(messages: List[ChatMessageRequest]) -> List[LLMChatMessage]:
    """Convert API messages to LLM messages."""
    return [LLMChatMessage(role=m.role, content=m.content) for m in messages]


async def _save_turn_to_ledger(
    project_id: str,
    conversation_id: str,
    role: str,
    content: str,
) -> None:
    """Save a turn to the ledger (async helper)."""
    # Import here to avoid circular dependency
    from core_api.routes.turns import create_turn
    from core_api.schemas import TurnCreate

    turn_data = TurnCreate(
        project_id=project_id,
        conversation_id=conversation_id,
        role=role,
        content=content,
    )
    # Note: create_turn is sync, we might want to make it async
    # For now, this is a placeholder for the integration


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/providers")
async def list_providers() -> ProvidersResponse:
    """
    List available LLM providers.

    Returns:
        List of provider names and default provider
    """
    from core.llm import list_providers as get_providers
    providers = get_providers()
    return ProvidersResponse(
        providers=providers,
        default="claude"
    )


@router.post("")
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Non-streaming chat endpoint.

    Use this for simple request/response without streaming.
    Provider can be auto-inferred from model name if not specified.
    """
    try:
        # Auto-infer provider from model name if model is specified
        provider = request.provider
        if request.model and provider == "claude":
            # Only auto-infer if using default provider
            inferred = _infer_provider_from_model(request.model)
            if inferred != provider:
                provider = inferred

        api_key = _get_api_key_for_provider(provider)
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"API key not configured for provider: {provider}"
            )

        config = LLMConfig(
            provider=provider,
            model=request.model or _get_default_model(provider),
            temperature=request.temperature or 0.7,
            max_tokens=request.max_tokens or 4096,
            api_key=api_key,
        )

        llm_provider = get_provider(config)
        messages = _convert_messages(request.messages)

        result = await llm_provider.agenerate(
            messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        return ChatResponse(
            content=result.content,
            model=result.model,
            usage=result.usage,
            finish_reason=result.finish_reason,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint using Server-Sent Events (SSE).

    Returns a stream of JSON events:
    - data: {"type": "token", "content": "..."} - Token content
    - data: {"type": "done", "model": "..."} - Stream complete
    - data: {"type": "error", "message": "..."} - Error occurred

    Provider can be auto-inferred from model name if not specified.

    Example usage with curl:
        curl -X POST http://localhost:8000/api/v1/chat/stream \\
            -H "Content-Type: application/json" \\
            -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
    """
    try:
        # Auto-infer provider from model name if model is specified
        provider_name = request.provider
        if request.model and provider_name == "claude":
            # Only auto-infer if using default provider
            inferred = _infer_provider_from_model(request.model)
            if inferred != provider_name:
                provider_name = inferred

        api_key = _get_api_key_for_provider(provider_name)
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail=f"API key not configured for provider: {provider_name}"
            )

        config = LLMConfig(
            provider=provider_name,
            model=request.model or _get_default_model(provider_name),
            temperature=request.temperature or 0.7,
            max_tokens=request.max_tokens or 4096,
            api_key=api_key,
        )

        llm_provider = get_provider(config)
        messages = _convert_messages(request.messages)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Setup error: {str(e)}")

    async def generate():
        """Generator for SSE stream."""
        accumulated_content = ""

        try:
            async for token in llm_provider.agenerate_stream(
                messages,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            ):
                accumulated_content += token
                event = {"type": "token", "content": token}
                yield f"data: {json.dumps(event)}\n\n"

            # Send completion event
            done_event = {
                "type": "done",
                "model": config.model,
                "content": accumulated_content,
            }
            yield f"data: {json.dumps(done_event)}\n\n"

        except Exception as e:
            error_event = {"type": "error", "message": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
