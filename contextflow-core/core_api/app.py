"""
FastAPI Application Main Entry Point

This is the reference implementation of the ContextFlow Core API.
"""

from __future__ import annotations

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI

# Load .env file (supports multiple locations)
try:
    from dotenv import load_dotenv

    # Search for .env file in priority order
    env_locations = [
        Path(__file__).parent.parent / ".env",  # contextflow-core/.env
        Path.home() / ".contextflow" / ".env",  # ~/.contextflow/.env
        Path.cwd() / ".env",  # Current working directory
    ]

    for env_path in env_locations:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass  # python-dotenv not installed, rely on environment variables
from fastapi.middleware.cors import CORSMiddleware

from core_api import __version__
from core_api.dependencies import set_start_time, ensure_directories
from core_api.errors import setup_exception_handlers
from core_api.routes import health, projects, conversations, turns, commits, branches, diff, merge, export, agent, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    # On startup
    set_start_time()
    ensure_directories()

    # Initialize database schema
    from core_api.database import init_database
    init_database()

    yield

    # On shutdown (if needed)
    pass


# Create FastAPI application
app = FastAPI(
    title="ContextFlow Core API",
    description="""
ContextFlow Core API - HTTP Protocol Reference Implementation

This is the HTTP API of ContextFlow Framework Core, providing:
- Projects / Conversations / Turns management
- Commits / Diff / Merge operations
- .cfpack export

**Protocol First**:Any language implementation that adheres to the CORE_API_SPEC specification is a compatible ContextFlow Core service.

For more information, please refer to [ContextFlow Architecture Documentation](https://github.com/contextflow/contextflow-core)
    """,
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ============================================================================
# Middleware
# ============================================================================

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Should be restricted in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Exception Handling
# ============================================================================

setup_exception_handlers(app)


# ============================================================================
# Route Registration
# ============================================================================

# Health (no version prefix)
app.include_router(health.router, tags=["Health"])

# Framework Core API
app.include_router(
    projects.router,
    prefix="/api/v1/projects",
    tags=["Projects"]
)
app.include_router(
    conversations.router,
    prefix="/api/v1/conversations",
    tags=["Conversations"]
)
app.include_router(
    turns.router,
    prefix="/api/v1/turns",
    tags=["Turns"]
)
app.include_router(
    commits.router,
    prefix="/api/v1/commits",
    tags=["Commits"]
)
app.include_router(
    branches.router,
    prefix="/api/v1/branches",
    tags=["Branches"]
)
app.include_router(
    diff.router,
    prefix="/api/v1/diff",
    tags=["Diff"]
)
app.include_router(
    merge.router,
    prefix="/api/v1/merge",
    tags=["Merge"]
)
app.include_router(
    export.router,
    prefix="/api/v1/export",
    tags=["Export"]
)

# Agentic Layer (Draft API)
app.include_router(
    agent.router,
    prefix="/api/v1/agent/drafts",
    tags=["Agent"]
)

# Chat API (Streaming LLM)
app.include_router(
    chat.router,
    prefix="/api/v1/chat",
    tags=["Chat"]
)


# ============================================================================
# API Version Information (response header)
# ============================================================================

@app.middleware("http")
async def add_api_version_header(request, call_next):
    """Add API version to response headers"""
    response = await call_next(request)
    response.headers["X-API-Version"] = __version__
    return response
