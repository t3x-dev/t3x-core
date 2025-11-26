"""
ContextFlow Core API - FastAPI 参考实现

这是 ContextFlow Core HTTP API 的参考实现，基于 FastAPI。
任何语言实现只要遵守 CORE_API_SPEC.zh.md 规范，即为兼容的 ContextFlow Core 服务。

使用方式：
    python -m core_api

或者：
    uvicorn core_api.app:app --host 0.0.0.0 --port 8000
"""

__version__ = "1.0.0"
