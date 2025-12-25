# T3X Core API - Docker 镜像
#
# NOTE: LEGACY / dev-only.
# 根目录 `docker-compose.yml` 现在使用 `t3x-cli/Dockerfile` 作为 Core API（Node server）。
#
# 构建：
#   docker build -t t3x-core-api .
#
# 运行：
#   docker run -p 8000:8000 t3x-core-api

FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CF_HOST=0.0.0.0 \
    CF_PORT=8000

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY core_api/requirements.txt ./core_api/

# 安装 Python 依赖
RUN pip install --no-cache-dir -r core_api/requirements.txt

# 复制应用代码
COPY core/ ./core/
COPY core_api/ ./core_api/

# 创建数据目录
RUN mkdir -p .t3x/ledger

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 启动命令
CMD ["python", "-m", "core_api"]
