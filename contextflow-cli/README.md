# ContextFlow CLI (MVP)

ContextFlow CLI 提供一个最小可用的终端聊天环境：直接在命令行输入 `contextflow` 即可进入交互式 Shell，设置/查看 Claude API Key、选择模型，与 Sonnet 4.5 持续对话，并把每一轮对话写入 `.contextflow/` 下的 JSONL 文件。

## Prerequisites
- Node.js 18 或更高版本（建议搭配 fnm / nvm）
- 拥有 Claude Sonnet 4.5 访问权限的 `ANTHROPIC_API_KEY`

## 安装与构建
1. 安装依赖：
   ```bash
   npm install
   ```
2. 构建 TypeScript：
   ```bash
   npm run build
   ```
3. （可选）把 CLI 链接到全局 PATH：
   ```bash
   npm link
   ```
   完成后即可在任意目录输入 `contextflow` 启动。

## 启动交互式 Shell
```bash
contextflow
```

启动时会自动探测/创建 `.contextflow` 目录，并提示当前会话日志路径。Shell 默认处于「聊天模式」，可直接输入内容与模型对话；也可以通过斜杠命令调整行为。

> 小提示：若你已在环境中设置 `HTTP_PROXY`/`HTTPS_PROXY`，CLI 会自动启用代理（无需额外配置）。

启动 `contextflow` 后会先询问一次当前 VPN/代理地址（例如 `127.0.0.1:10808`）：  
- 直接输入地址即可自动启用代理并保存，下次默认使用；  
- 回车可沿用上次值；  
- 输入 `none` 则关闭代理。  
CLI 会在内部设置环境变量并挂上代理，无需提前在终端里 `export HTTPS_PROXY=...`。

### 聊天模式命令
- `/help`：查看命令列表
- `/new NAME`：新建会话项目
- `/config`：进入配置模式（设置 API Key、模型、流式输出）
- `/project [NAME]`：不带参数时列出可用项目，带名称时切换会话项目
- `/clear`：清空本次会话的上下文记忆
- `/exit`：退出 CLI

### 配置模式命令
进入配置模式后提示会变成 `config> `，支持：
- `/help`：查看配置命令说明
- `/api [KEY]`：查看或更新 `ANTHROPIC_API_KEY`
- `/model [NAME]`：查看或更新默认模型（默认 `sonnet4.5`）
- `/proxy`：查看当前代理与默认代理配置
- `/param`：查看模型/API Key/代理等参数状态
- `/file`：查看 Workspace 与会话日志路径
- `/stream on|off`：开关流式输出
- `/back`：返回聊天模式

所有配置都会写入 `~/.contextflow/config.json`，并在运行期立即生效。

## 会话日志与记忆
- 每次启动 CLI，会默认使用 `default` 项目把对话轮次写入 `.contextflow/conversations/<project>/conversation.jsonl`
- JSON Lines 严格符合 `schema/v1.0.json`（可参考 `examples/*.contextflow`）：`id` 采用 `turn-<uuid>`，`role` 为 `user|assistant|system`，包含 `text`、ISO 8601 `timestamp` 字段，便于后续分析或同步
- 重启 CLI 时会自动读取历史 JSONL，恢复最近 20 轮对话给 Claude；更早的轮次会被压缩为一条 `system` 摘要消息（超过 1500 字符会再次截断），既保留上下文记忆，又避免超出上下文窗口

## 项目结构速览
- `package.json`, `package-lock.json`：定义 CLI 元信息、执行入口 `dist/bin/contextflow.js`、依赖与脚本
- `bin/contextflow.ts`：CLI 可执行入口（shebang + 主函数）
- `src/runtime/contextflowShell.ts`：交互式 Shell 主循环，处理聊天/配置两种模式
- `src/runtime/logger.ts`：封装带 `[contextflow]` 前缀的日志输出
- `src/core/`：
  - `config.ts`：读写 `~/.contextflow/config.json`，解析运行时配置
  - `conversationStore.ts`：管理 `.contextflow/conversations/<project>/conversation.jsonl`
  - `root.ts`：发现/创建 `.contextflow` 项目根目录
  - `types.ts`：共享类型定义
- `src/providers/claude.ts`：封装 Claude Messages API，支持流式与非流式
- `src/utils/fs.ts`：文件系统辅助函数
- `dist/`：`npm run build` 后生成的编译产物

## 开发说明
- TypeScript 源码位于 `bin/` 与 `src/`
- 使用 `npm run build` 生成 `dist/` 下的 JS
- 调试可运行 `npm start` 或直接执行 `node dist/bin/contextflow.js`
