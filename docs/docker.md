# Docker（Phase A/B 对齐）

## 主入口（唯一 full-stack 入口）

仓库根目录的 `docker-compose.yml` 是唯一 full-stack 入口。

启动（默认起 `postgres + core + webui`）：

```bash
cp .env.example .env
docker compose up -d --build
```

验收：
- `docker compose ps` → `postgres` / `t3x-core` / `t3x-webui` 都是 `Up`（且 postgres 为 healthy）
- `http://localhost:8000/health` → `{"status":"ok", ...}`
- `http://localhost:3000` → WebUI 可打开

数据持久化：
- Postgres 使用命名卷 `t3x-pgdata` 持久化（容器内：`/var/lib/postgresql/data`）。
- Core 仍使用命名卷 `t3x-data` 持久化 `.t3x/` 目录（容器内：`/app/.t3x`，用于 ledger/缓存等文件）。

## 可选组件（profiles）

为避免 Phase A 一起拉起太多服务，以下都放在 profile 里：

- Runner：
  ```bash
  docker compose --profile runner up -d --build
  ```
- Agent Demo：
  ```bash
  docker compose --profile agent-demo up -d --build
  ```
- n8n（默认 SQLite + volume）：
  ```bash
  docker compose --profile n8n up -d
  ```
  打开：`http://localhost:5678`（数据卷：`n8n-data:/home/node/.n8n`）

## 本地 SQLite（不影响）

本地运行时如果 **不设置** `DATABASE_URL`，Core 默认仍使用 SQLite（`<repo>/.t3x/project.db`）。

示例（本地起 Core API）：

```bash
npm run build
npm run serve -w t3x-cli
```

## WebUI 的 `VITE_*` 配置（重要）

WebUI 镜像是 `vite build` 后用静态服务器 `serve dist`；`VITE_*` 属于 **build-time 注入**。

根 `docker-compose.yml` 已通过 `build.args` 传入：
- `VITE_CORE_API_URL`（默认：`http://localhost:8000`）
- `VITE_RUNNER_API_URL`（默认：`http://localhost:8080`）

如需改地址，需要 **重新 build**（示例）：

```bash
VITE_CORE_API_URL=http://localhost:8000 \
VITE_RUNNER_API_URL=http://localhost:8080 \
docker compose up -d --build
```

## `t3x-core/docker-compose.yml`（dev-only / legacy）

`t3x-core/docker-compose.yml` 仅用于“单跑 core”调试，避免误用为 full-stack。

```bash
docker compose -f t3x-core/docker-compose.yml up -d --build
```

## 安全提示

- `.env` 不提交，只提交 `.env.example`。
- `POSTGRES_PASSWORD` 仅用于 dev；生产环境请使用 secret 管理。
- volume 名固定（`t3x-pgdata`），便于备份与迁移：`docker volume ls | grep t3x-pgdata`
