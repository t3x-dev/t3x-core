"""
命令行启动入口

使用方式：
    python -m core_api
    python -m core_api --port 8080
    python -m core_api --host 0.0.0.0 --port 8000 --reload
"""

import argparse
import os
import uvicorn


def main():
    parser = argparse.ArgumentParser(description="ContextFlow Core API Server")
    parser.add_argument(
        "--host",
        default=os.getenv("CF_HOST", "127.0.0.1"),
        help="Host to bind (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("CF_PORT", "8000")),
        help="Port to bind (default: 8000)"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=os.getenv("CF_RELOAD", "").lower() == "true",
        help="Enable auto-reload for development"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=int(os.getenv("CF_WORKERS", "1")),
        help="Number of worker processes (default: 1)"
    )

    args = parser.parse_args()

    print(f"Starting ContextFlow Core API on http://{args.host}:{args.port}")
    print(f"API docs available at http://{args.host}:{args.port}/docs")

    uvicorn.run(
        "core_api.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers if not args.reload else 1,
    )


if __name__ == "__main__":
    main()
