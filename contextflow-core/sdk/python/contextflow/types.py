"""ContextFlow type definitions."""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


class APICallMetadata(BaseModel):
    provider: str
    model: str
    request_id: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    usage: Optional[Dict[str, int]] = None
    cost: Optional[Dict[str, float]] = None
    latency_ms: Optional[int] = None
    finish_reason: Optional[str] = None


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str
    timestamp: Optional[str] = None
    api_call: Optional[APICallMetadata] = None


class Conversation(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    created: Optional[str] = None
    source: Optional[str] = None
    messages: List[Message]
    tags: Optional[List[str]] = None


class Note(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    content: str
    type: Literal["text/plain", "text/markdown", "text/html"] = "text/markdown"
    created: Optional[str] = None
    modified: Optional[str] = None
    tags: Optional[List[str]] = None


class Preferences(BaseModel):
    languages: Optional[List[str]] = None
    frameworks: Optional[List[str]] = None
    style: Optional[str] = None
    tone: Optional[str] = None

    class Config:
        extra = "allow"  # Allow additional fields


class FileReference(BaseModel):
    id: Optional[str] = None
    path: str
    name: Optional[str] = None
    type: str
    content: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class Prompt(BaseModel):
    id: Optional[str] = None
    version: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    content: str
    target: Optional[str] = None
    task: Optional[str] = None
    created: Optional[str] = None
    based_on: Optional[List[str]] = None
    performance: Optional[Dict[str, Any]] = None
    parent_version: Optional[int] = None
    changes: Optional[str] = None


class SignatureMetadata(BaseModel):
    status: Optional[Literal["verified", "pending", "missing", "invalid", "skipped"]] = None
    algorithm: Optional[str] = None
    verified_at: Optional[datetime] = None
    signer: Optional[str] = None
    commit: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        extra = "allow"


class UsageSummaryDiff(BaseModel):
    from_commit: Optional[str] = None
    to_commit: Optional[str] = None
    generated_at: Optional[datetime] = None
    summary: Optional[str] = None
    aspect_changes: Optional[int] = None
    stats: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


class UsageSummaryOperation(BaseModel):
    name: str
    count: Optional[int] = None
    last_used: Optional[datetime] = None

    class Config:
        extra = "allow"


class UsageSummary(BaseModel):
    total_conversations: Optional[int] = None
    total_messages: Optional[int] = None
    total_cost: Optional[float] = None
    currency: Optional[str] = "USD"
    by_provider: Optional[Dict[str, Dict[str, Any]]] = None
    by_model: Optional[Dict[str, Dict[str, Any]]] = None
    last_diff: Optional[UsageSummaryDiff] = None
    operations: Optional[List[UsageSummaryOperation]] = None


class ContextFlowMetadata(BaseModel):
    id: Optional[str] = None
    created: str
    modified: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    version: Optional[str] = None
    branch: Optional[str] = None
    signature: Optional[SignatureMetadata] = None


class ContextFlowFile(BaseModel):
    contextflow_version: str = "1.0"
    schema_: Optional[str] = Field(None, alias="$schema")
    metadata: ContextFlowMetadata
    conversations: Optional[List[Conversation]] = None
    notes: Optional[List[Note]] = None
    preferences: Optional[Preferences] = None
    files: Optional[List[FileReference]] = None
    prompts: Optional[List[Prompt]] = None
    usage_summary: Optional[UsageSummary] = None
    _tooling: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True
