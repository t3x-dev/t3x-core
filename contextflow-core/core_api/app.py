"""
FastAPI 应用主入口

这是 ContextFlow Core API 的参考实现。
"""

from __future__ import annotations

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI

# 加载 .env 文件（支持多个位置）
try:
    from dotenv import load_dotenv

    # 按优先级查找 .env 文件
    env_locations = [
        Path(__file__).parent.parent / ".env",  # contextflow-core/.env
        Path.home() / ".contextflow" / ".env",  # ~/.contextflow/.env
        Path.cwd() / ".env",  # 当前工作目录
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
from core_api.routes import health, projects, conversations, turns, commits, branches, diff, merge, export, agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    set_start_time()
    ensure_directories()

    # 初始化数据库 schema
    from core_api.database import init_database
    init_database()

    yield

    # 关闭时（如有需要）
    pass


# 创建 FastAPI 应用
app = FastAPI(
    title="ContextFlow Core API",
    description="""
ContextFlow Core API - HTTP 协议参考实现

这是 ContextFlow Framework Core 的 HTTP API，提供：
- Projects / Conversations / Turns 管理
- Commits / Diff / Merge 操作
- .cfpack 导出

**协议优先**：任何语言实现只要遵守 CORE_API_SPEC.zh.md 规范，即为兼容的 ContextFlow Core 服务。

更多信息请参考 [ContextFlow 架构文档](https://github.com/contextflow/contextflow-core)
    """,
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ============================================================================
# 中间件
# ============================================================================

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# 异常处理
# ============================================================================

setup_exception_handlers(app)


# ============================================================================
# 路由注册
# ============================================================================

# Health（不带版本号）
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


# ============================================================================
# API 版本信息（响应头）
# ============================================================================

@app.middleware("http")
async def add_api_version_header(request, call_next):
    """在响应头中添加 API 版本"""
    response = await call_next(request)
    response.headers["X-API-Version"] = __version__
    return response
