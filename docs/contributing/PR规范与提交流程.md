# PR 规范与提交流程

本文汇总 T3X 当前的 Pull Request（PR）规则、提交流程和可复用文本。

## 适用范围

| PR 类型 | 源分支 | 目标分支 | 用途 |
| --- | --- | --- | --- |
| 普通开发 PR | 功能分支 | `dev` | 合入日常产品、工程和文档改动 |
| 正常发版 PR | `release/x.y.z` | `main` | 将已审阅的产品候选版本发布为 T3X 产品版本 |
| 紧急修复 PR | `hotfix/*` | `main` | 绕过常规发版列车的紧急修复；合入后仍需回合到 `dev` |
| Changesets 版本 PR | Changesets 自动化分支 | `main` | 根据 Changesets 进行包版本和发布处理 |

普通开发 PR 一律以 `dev` 为目标分支。不要把普通功能分支直接提交到 `main`。

## 普通开发 PR 的要求

每个普通 PR 应当包含：

1. 关联 Issue（通常一个 Issue 对应一个 PR）。
2. 对实际行为变化的简要说明。
3. 已执行的验证命令或 CI 结果；没有执行时如实说明原因，不要写成已通过。
4. Release Impact 声明。
5. 涉及公开包行为时的 Changeset 状态。

以下改动需要填写相应 Release Impact；其中用户可见行为变化通常需要 Changeset：

- `@t3x-dev/local`
- `@t3x-dev/yops`
- `@t3x-dev/transition`
- `@t3x-dev/yschema`
- 发布、打包、安装或公开文档契约

如果不影响公开包行为和已文档化的公开契约，可选择 `No release impact`。

以下类型的受保护改动发生时，应请求 owner review：

- 代码所有权与评审规则
- 分支、发版和发布策略
- 自动化工作流与 CI/CD 配置
- 产品或包的发布面、版本和稳定性政策
- PR 门禁与分支保护规则

## 普通 PR 操作步骤

### 1. 确认范围

先确认当前分支、未提交改动和本 PR 的文件边界。工作区不干净时，保留其他任务的改动，只暂存本 PR 需要的文件；不要使用无差别的 `git add .`。

```bash
git status --short --branch
git diff --stat
git add <本次 PR 需要的文件或目录>
git diff --cached --stat
```

### 2. 提交

提交信息采用 Conventional Commits，例如：

```bash
git commit -m "feat(web): restore project state and workspace experiences"
```

常用类型包括 `feat`、`fix`、`docs`、`test`、`refactor`、`chore`；作用域按实际包或应用填写，例如 `web`、`core`、`storage`。

### 3. 验证

按改动范围执行最小且相关的验证。仓库为 PR 规定的完整基线是：

```bash
pnpm check:release-pr
pnpm check
pnpm check:release-surface
pnpm build
pnpm test
```

其中 `pnpm check:release-pr` 依赖 CI 传入 PR 元数据，本地仅在显式提供对应元数据时才有意义。日常小范围改动可先执行受影响包的检查、构建和测试；PR 中必须如实记录实际执行内容。

### 4. 推送并创建 PR

普通开发分支推送后，以 `dev` 为目标分支创建 PR：

```bash
git push -u origin <你的功能分支>
gh pr create \
  --base dev \
  --head <你的功能分支> \
  --title "feat(web): 简短描述实际变更" \
  --body "<PR 正文>"
```

也可以在 GitHub 网页上选择该功能分支，点击 `Compare & pull request`，确认 base 为 `dev` 后粘贴正文并创建。

### 5. 合并前检查

`dev` 和 `main` 当前都要求 PR Validation；该检查对应 `PR Validation / Check, build, and test`。合并前还应确保：

- PR 描述完整，Issue、Release Impact 与 Changeset 状态一致。
- CI 结果和实际改动一致。
- 讨论已解决。
- 改动受保护区域时，已取得 owner review。

## 普通开发 PR 正文模板

将尖括号中的内容替换为实际信息。未运行验证时，保留真实状态，不要填写为 passed。

```md
## Summary

- <一句话说明用户或系统行为发生了什么变化>
- <必要时补充第二条，说明范围或兼容性>

## Linked Issue

Closes #<issue-number>

## Matrix Rows

Rows advanced by this PR:

- [ ] None / not applicable
- [ ] row-1 - <one-sentence pitch>
- [ ] row-2a - public npm install
- [ ] row-2b - runtime download
- [ ] row-2c - no-key seeded demo
- [ ] row-3 - versioning and YOps stability
- [ ] row-4 - public package surface
- [ ] row-5 - self-host
- [ ] row-6 - contributor experience
- [ ] row-7 - external narrative
- [ ] row-8 - team usage evidence

## Release Impact

- [ ] No release impact
- [ ] Changes public behavior for `@t3x-dev/local`
- [ ] Changes public behavior for `@t3x-dev/yops`
- [ ] Changes public behavior for `@t3x-dev/transition`
- [ ] Changes public behavior for `@t3x-dev/yschema`
- [ ] Changes release, packaging, or publish behavior
- [ ] Changes public documentation contract

Changeset:

- [ ] Not needed
- [ ] Added
- [ ] Needed, but will be handled in a follow-up version/release PR

## Verification

Commands or workflow results:

```bash
<实际执行的命令与结果；未运行则说明 Not run locally; centralized validation pending.>
```

## Protected Areas

- [ ] This PR changes protected governance, release, workflow, or ownership rules
- [ ] Owner review requested when protected areas changed

## Notes

- <评审者需要知道的范围、风险、兼容性或后续事项>
```

## 当前 WebUI 改动可用的 PR 示例

如果本次 PR 的范围是恢复项目状态、历史、工作区与设置相关体验，可使用：

```md
## Summary

- Restore and consolidate the WebUI experiences for project state, history, workspace composition/review, and settings.
- Align shared project routing and directly required API/provider support with those user workflows.

## Linked Issue

Closes #<issue-number>

## Matrix Rows

Rows advanced by this PR:

- [x] row-1 - product workflow and project-state experience

## Release Impact

- [x] No release impact

Changeset:

- [x] Not needed

## Verification

Commands or workflow results:

```bash
Not run locally; centralized validation pending.
```

## Protected Areas

- [ ] This PR changes protected governance, release, workflow, or ownership rules
- [x] Owner review not required

## Notes

- This PR is intentionally scoped to the WebUI and its directly required API/storage support.
- Review project routing, state/history, workspace review, and settings as connected user workflows.
```

## 发版工具使用说明

T3X 的发版工具由 **Release Train** 自动化流程和命令行计划工具组成。它的职责是：基于 `dev` 生成 `release/x.y.z` 分支和对应的发版 PR；它本身不直接发布 npm 包。

正常情况下，优先通过 GitHub Actions 使用该工具：进入仓库的 **Actions → Release Train → Run workflow**，工作流会从 `dev` 读取代码并生成计划或草稿 PR。

### 发版前的判断

先区分两种版本线：

- **T3X 产品版本**：对应 `release/x.y.z`、`t3x-vx.y.z` 标签和产品 Release Notes。
- **npm 包版本**：由 Changesets 独立决定，可能与产品版本不同。

产品发版可以是纯代码发版，不代表必须发布 npm 包。只有公开包用户可见行为或公开契约变化时，才需要 Changeset 和包发布意图。

当前自动发布列车中的公开包是：

- `@t3x-dev/yops`
- `@t3x-dev/transition`
- `@t3x-dev/yschema`

`@t3x-dev/local` 虽然仍是公开 alpha 包，但已暂停自动发布列车；如需发布，必须明确人工决定，并完成对应运行时产物、安装和必要的无密钥演示检查。

### 推荐用法：先生成不写远端的计划

首次运行或不确定版本、包范围时，保持以下输入，生成 dry run：

| Release Train 输入 | 建议值 | 说明 |
| --- | --- | --- |
| `version` | `auto` | 自动推导产品版本；也可填写 `x.y.z` |
| `mode` | `code-only` | 默认且最安全，不生成包发布意图 |
| `packages` | `none` 或 `auto` | 纯代码发版不选择包 |
| `package_bump` | `patch` | 纯代码模式下不会使用 |
| `package_version` | `auto` | 保持独立推导 |
| `first_publish_packages` | `none` | 仅首次发布包时才填写 |
| `dry_run` | `true` | 只打印计划，不推送、不建 PR |
| `draft` | `true` | 仅在实际创建 PR 时生效 |

dry run 会输出：推导出的产品版本、拟创建的 `release/x.y.z` 分支、PR 标题和正文、受影响文件、Changeset 计划、策略诊断与警告。它不会产生远端写入。

### 创建纯代码发版 PR

确认 dry run 的版本、范围和生成正文后，在 **Release Train** 手动运行中设置：

```text
version: auto 或 x.y.z
mode: code-only
packages: none
dry_run: false
draft: true
```

工具会创建或更新 `release/x.y.z → main` 的草稿 PR，并预填发版正文。随后补充或确认 Included Changes、Release Notes、Known Risks 和 `Package Releases: - None`。

命令行计划工具的应用模式会创建或更新远端分支和 PR，且要求干净工作区与有效 GitHub 授权；它属于远端写操作。除非已明确决定发版和具备相应权限，日常不要直接使用该模式。

### 创建带 npm 包发布意图的发版 PR

仅当确认某个活跃公开包需要发布时，才在 **Release Train** 使用：

```text
version: auto 或 x.y.z
mode: package
packages: yops、transition、yschema、all-active，或逗号分隔的子集
package_bump: patch / minor / major
package_version: auto
first_publish_packages: none
dry_run: true（先检查计划）
```

确认计划后再将 `dry_run` 改为 `false`。工具会根据已有 Changeset 或所选 bump 生成必要的 Changeset；发版 PR 的 `Package Releases` 将列出具体的目标包版本，而不是 `patch`、`minor` 或 `major`。

包发布模式的关键约束：

- `code-only` 模式下不能带有活跃公开包的 Changeset。
- `package` 模式必须有至少一个活跃包 Changeset，或明确的一次性首次发布包。
- `package_version` 只在确有明确目标版本时填写；该版本必须能由一次 patch、minor 或 major bump 合法得到。
- 一次性首发用 `first_publish_packages` 指定，PR 中的版本必须与该包当前 `package.json` 版本一致，并标记 `(first publish)`。

### 发版 PR 的审核与合并

工具生成 PR 后，不等于已发版。按以下顺序处理：

1. 检查 PR 中产品版本和 `release/x.y.z` 分支名一致。
2. 核对 Included Changes、Release Notes、Package Releases 和 Known Risks。
3. 等待 PR Validation、release surface 和 Release Readiness 报告。
4. 涉及受保护的发版、工作流或所有权文件时请求 owner review。
5. 所有必需检查及人工门禁满足后，合并至 `main`。

合并到 `main` 后，Release 工作流会创建 `t3x-vx.y.z` 产品 GitHub Release。如果存在未消费的 Changeset，它会创建 `chore: version packages` PR；该版本 PR 合并后，才会发布选定包及上传相应资产。没有 Changeset 时，这次产品发版就是纯代码发版，不会发布 npm 包。

### Release Readiness 与人工签署

Release Readiness 会把可自动判断的标准、人工门禁、外部测试证据和阻塞项汇总为 Markdown 与 JSON，并将摘要写入发版 PR。状态可能为 `ready`、`blocked` 或 `manual_pending`。

只有预先指定的 release owner 才能在发版 PR 评论中对人工行签署：

```text
/t3x readiness approve <row-id> <原因>
/t3x readiness block <row-id> <原因>
/t3x readiness clear <row-id>
```

`row-id` 只能是 `row-1`、`row-2a`、`row-2b`、`row-2c`、`row-3` 到 `row-8`。`approve` 和 `block` 必须包含原因；签署状态由机器人维护，手工复制机器人标记不会被信任。

## 发版 PR 要点

发版 PR 从 `release/x.y.z` 合入 `main`。正文必须明确包含：

- `T3X product release version: \`x.y.z\``
- 合入的 PR 列表或对比范围
- 用户可读的 Release Notes
- `Package Releases`：无包发布时填写 `- None`；有包发布时列出具体目标版本
- 需要时的本地运行时、安装和无密钥演示检查

产品版本与 npm 包版本彼此独立。`Package Releases` 中写最终包版本，不写 `patch`、`minor` 或 `major` 等 Changeset bump 类型。
