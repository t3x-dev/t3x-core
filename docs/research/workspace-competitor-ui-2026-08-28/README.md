# T3X Workspace 竞品界面调研

日期：2026-08-28

## 范围

围绕当前 `Workspace Compose -> Review -> Decision/Commit` 两个页面，比较以下问题：

- 输入、对话和来源材料怎样汇入一次提案；
- 多个变更怎样被定位、浏览和标记已查看；
- 校验、冲突、评论和来源证据怎样与具体变更关联；
- 人怎样做出接受、拒绝、覆盖或提交决定；
- 全局状态、单项状态和最终落库状态怎样避免互相矛盾。

本目录保留用户提供的两张 T3X 基线图，以及来自官方文档、官方产品页或明确标注的产品示例图。因本次内置浏览器无法稳定打开竞品站点，这是一份“官方发布截图研究包”，不是登录态下的完整交互审计。

## 一眼结论

T3X 不需要照抄某一个产品。最适合的组合是：

1. Compose 借 Cursor 的“任务上下文 + 变更摘要 + 实时 Review 入口”，但保留 T3X 的 Source 捕获和可追溯性。
2. Review 借 GitHub/GitLab 的“文件或节点导航 + 稳定 diff 工具栏 + viewed 进度”。
3. 决策借 Graphite 的“汇总评论 + 明确互斥结果”，映射为 T3X 的 Reject / Accept / Authorized override。
4. 治理借 Gerrit 的“提交条件、校验票据、patch set、依赖关系、时间线”，但不要照搬它的高学习成本。
5. Evidence 是 T3X 相对这些产品真正独特的部分，应继续保留，但默认折叠为紧凑证据摘要，不要让每个变更都变成大卡片套卡片。

## 截图索引与观察

### 00. T3X 当前基线

- `00-t3x-compose-reference.png`：Compose 左侧是对话/Source draft，右侧是 Proposal 摘要、changeset 和冲突入口。
- `00-t3x-review-reference.png`：Review 左侧是 changed nodes，中间是 before/after 与 Evidence，顶部和底部同时显示校验/提交状态。

当前最需要先解决的不是视觉样式，而是状态真相：同一屏同时出现 `0/2 validations passed`、绿色 `Committed`、单项 `Pending` 和 `Committed to State`。竞品通常把对象状态、检查状态和最终决策分开呈现，只有满足门槛后才把合并/提交动作变成最终状态。

### 01–02. GitHub Pull Request

- `01-github-diff-settings.webp`：changed-file tree、文件过滤、viewed 进度、统一/分栏 diff 和隐藏空白字符都集中在稳定工具栏。
- `02-github-review-decision.webp`：PR 身份、base/head、commits、checks、files changed 与 Review changes 决策入口在一条清晰的层级中。
- 可借：稳定的全局工具栏、已查看进度、变更范围筛选、最终 review 入口。
- 不照搬：T3X 的对象是结构化字段/节点，不应把路径阅读退化成纯代码文件阅读。
- 来源：[GitHub Docs - Reviewing proposed changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request)

### 03. Hugging Face Community / PR

- `03-huggingface-community-list.png`：Discussion 与 PR 共用 Community 入口，只用类型图标、标题、作者、时间和评论数区分，信息负担很低。
- 可借：Compose 的 Proposal 列表或历史入口可以先按“需要处理的工作”组织，再用类型/状态区分，不需要先暴露协议对象。
- 不照搬：它的 PR 治理和校验层明显比 T3X 目标简单，不能作为 Review 的完整范本。
- 来源：[Hugging Face Hub - Pull requests and Discussions](https://huggingface.co/docs/hub/repositories-pull-requests-discussions)

### 04–06. GitLab Merge Request

- `04-gitlab-merge-request-diff.png`：每个文件头部同时承载路径、增删量、Viewed、评论和更多操作。
- `05-gitlab-side-by-side-diff.png`：旧值/新值分栏稳定，行号和局部修改提示很强。
- `06-gitlab-conflict-state.png`：冲突提示贴在具体文件上，并给出线上或本地解决的明确去向。
- 可借：把 validation/conflict 贴到具体 node/field，而不是只放在全局橙色大框里；节点行应显示状态和未解决数。
- 不照搬：代码 diff 的行级密度不适合所有结构化值；标量、数组、对象和长文本需要各自的 renderer。
- 来源：[GitLab Docs - Changes in merge requests](https://docs.gitlab.com/user/project/merge_requests/changes/)

### 07–08. Cursor Agent / Review

- `07-cursor-composer-review.png`：左侧是任务、模型/agent、完成说明和文件摘要；右侧直接展开 Pending files diff，并提供 Undo All / Apply All。
- `08-cursor-agent-review-beta.png`：Agent Review 是独立的检查入口，与 Commit & Push 相邻但不混为一个状态。
- 可借：Compose 不必把所有 Source draft 正文平铺；可以保留对话，把“本轮提取了什么、会改哪些节点、检查结果”做成紧凑回执，并随时进入 Review。
- 风险：Cursor 允许大粒度 Apply All，T3X 仍需遵守确定性回放、校验和人的 Decision 门槛，不能让 AI 生成结果直接等于已提交状态。
- 来源：[Cursor Learn - Reviewing and testing code](https://cursor.com/learn/reviewing-testing)、[Cursor Docs - Agent Review](https://prod.cursor.com/docs/agent/agent-review)
- 截图说明：`07` 来自 Codecademy 对 Cursor 2.0 的产品示例；`08` 来自 Cursor 官方社区的 Agent Review 界面反馈，因为当前 Cursor 官方旧截图地址返回错误。

### 09–10. Graphite Pull Request Review

- `09-graphite-pr-overview.png`：主区依次是 What changed / Why / Risks、文件 diff；右栏固定显示冲突、checks、approvals、labels 和 timeline。
- `10-graphite-finish-review.png`：评论汇总与 Request changes / Just add comments / Approve 是一个明确的最终决策面板。
- 可借：这是最接近 T3X Review 的整体构图。T3X 可以把右栏改造成 readiness/decision rail，集中显示 replay、external statements、冲突、reviewer 和最终决策。
- 不照搬：T3X 的 Evidence/Source provenance 比 Graphite 更重要，不能被普通 PR 描述替代。
- 来源：[Graphite Docs - Key features](https://graphite.com/docs/key-features)、[Review pull requests](https://graphite.com/docs/review-pull-requests)

### 11. Gerrit Change Screen

- `11-gerrit-change-screen.png`：Change Info、Submit Requirements、依赖关系、文件列表、评论/checks 和 Change Log 在一屏形成完整审计面。
- 可借：把“能否提交”拆成可解释的条件清单；保留 revision/patch set 和每次验证/决策的时间线。
- 不照搬：页面非常密集，关系链和投票模型学习成本高。T3X 应默认只展示当前决策所需的信息，历史和高级治理按需展开。
- 来源：[Gerrit - Review UI Overview](https://gerrit-review.googlesource.com/Documentation/user-review-ui.html)

## 对 T3X 两个页面的具体建议

### Compose

1. 保留“自然语言 + Add source”的低摩擦入口。
2. 将重复的 Source draft 正文压成每轮回执：Captured sources、candidate changes、open questions、conflicts。
3. 右侧 Proposal rail 只保留当前 proposal 的身份、workspace/base、变更数、来源数、未解决项和进入 Review 的主动作。
4. `Proceed to Review` 必须由真实 readiness 驱动；有冲突时显示“Review 3 unresolved items”，而不是让主按钮和错误框互相竞争。
5. 不在 Compose 宣称 committed。这里最多是 draft/proposed/prepared。

### Review

1. 顶部建立唯一状态条：`base -> draft`、revision、changes、replay、statements、conflicts、decision。对象状态和检查状态必须分列。
2. 左侧 changed nodes 增加 viewed/unresolved 状态和筛选，沿用 GitHub/GitLab 的扫描效率。
3. 中间根据值类型选择 renderer：标量 before/after、长文本 diff、对象 tree diff、数组 item diff；不要统一塞进大白框。
4. Evidence 默认显示“2 sources / 1 statement”等紧凑摘要，展开后再看原始来源、定位、时间和 receipt。
5. 右侧或底部只保留一个 Decision 面板：Reject、Accept & Commit、Authorized override；每个动作写清后果。
6. 决策完成后切换为 receipt，而不是同时保留 Pending、Committed 和可再次提交的主按钮。

## 推荐优先级

### P0：先修状态真相

- 消除 `0/2 passed` 与绿色 committed 同屏的矛盾。
- 明确 Draft、Prepared、Needs review、Accepted、Rejected、Overridden、Committed 的互斥/先后关系。
- 只有 accepted 或 authorized override 才能进入 Commit。

### P1：建立 Review 的稳定骨架

- changed nodes + viewed/unresolved；
- typed diff renderer；
- compact evidence；
- single decision surface。

### P2：压缩 Compose 噪声

- 把重复 Source draft 改成可展开回执；
- 让右栏成为可读的 proposal/readiness 摘要；
- 保持输入区轻，工作台区硬。

## 卡片式业务变更补充

这一轮刻意跳出代码 diff，补充设计对象、功能开关、实验、内容条目、记录字段和网页分支等更接近“业务对象变更”的产品。共同点不是把整个页面做成卡片墙，而是把一个可以被人判断、追溯或批准的对象做成稳定的变更单元。

### 12. Figma Branch Review

- `12-figma-branch-review-cards.png`：按 Page 分组，每个组件/画板是一张带缩略图的对象卡；右上角直接标记 Added、Edited、Removed，卡片下方给出对象路径、变体数和影响项数。
- 最值得借：先让用户认出“改的是哪个对象”，再让状态颜色辅助扫读；reviewer、总体变更数和 Merge 动作在卡片区之外。
- 不直接照搬：T3X 的节点未必有视觉缩略图，应改成类型化值预览或语义摘要，不能为了卡片感塞假预览图。
- 来源：[Figma Help - Review branch changes](https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes)

### 13. Unleash Change Request

- `13-unleash-change-request-card.png`：顶部先给 change request 身份、环境、作者、更新时间和 review required；左侧是 Draft -> In review -> Approved -> Applied 生命周期，右侧每个 feature flag 是一张变更对象卡。
- 卡片内部并不只显示“字段改了”，而是把新状态、增加的 rollout strategy、25% 人群范围、评论都放在同一上下文。
- 最值得借：这是和 T3X 最接近的范本——对象卡 + 生命周期 + reviewer + comment + applied 结果彼此独立，又能在一屏完成判断。
- 来源：[Unleash Docs - Change requests](https://docs.getunleash.io/concepts/change-requests)

### 14. LaunchDarkly Experiment Approval

- `14-launchdarkly-experiment-approval.png`：一个 approval request 下分成 Experiment 和 Flag targeting rules 两组卡片；每组用自然语言概括变更，再展开具体 variation 与百分比。
- 右栏固定展示请求人、approval status 和 reviewers；Approve / Decline 紧贴变更内容但不伪装成对象状态。
- 最值得借：先写“这项变更意味着什么”，详细字段只是第二层；同一申请可以包含多个相关业务对象。
- 来源：[LaunchDarkly - Introducing experiment approvals](https://launchdarkly.com/blog/introducing-experiment-approvals/)

### 15–16. Sanity Content Releases / Field History

- `15-sanity-release-object-list.png`：一次 Release 作为容器，内部每个文档对象用一行轻卡表达 Add / Change、内容类型、标题、路径、协作者和最近编辑时间；大量对象时仍保持工作台密度。
- `16-sanity-field-history.png`：修改痕迹直接贴在字段值旁，通过颜色、作者头像、时间和 Revert changes 表达归属与恢复动作。
- 最值得借：卡片不必都厚重。变更多时先用轻量对象行扫描，进入具体对象后再展示字段级证据和恢复动作。
- 来源：[Sanity Docs - Content Releases](https://www.sanity.io/docs/user-guides/content-releases)、[History experience](https://www.sanity.io/docs/user-guides/history-experience)

### 17. Contentful Version Compare

- `17-contentful-version-compare.png`：当前版本和历史版本并排，各自保留完整内容形态；顶部只有 Close / Apply changes，决策路径很短。
- 最值得借：对于长文本或富内容，不要把差异强行压成几行属性表；保留“完整对象卡 + 并排比较”，再提供 only differences 或字段级 cherry-pick。
- 风险：两张完整卡在空白多时会显得很松，T3X 应根据值类型自动选择 compact scalar、inline text diff 或 full object compare。
- 来源：[Contentful Help - Versions](https://www.contentful.com/help/content-and-entries/versions/)

### 18. Airtable Record Revision History

- `18-airtable-record-revision-history.jpg`：右侧 activity 里，每次字段修改是一张很小的历史卡；旧值划掉、新值高亮，并带操作者与时间。
- 最值得借：标量、枚举、人员或标签变化可以直接做成 `field / old -> new` 小卡，不需要占据一整块 before/after 画布。
- 局限：它主要用于追溯，不承担 proposal 级审批；可借字段卡样式，不可借完整治理模型。
- 来源：[Airtable Blog - Airtable views tips](https://blog.airtable.com/airtable-views-7-essential-tips-tricks/)

### 19. Webflow Merge Summary

- `19-webflow-merge-summary.webp`：合并前先用一张摘要卡说明后果，再把 42 个变更聚合为 global design changes 与 page changes，支持 See all changes 下钻。
- 最值得借：最终提交前不是再次铺满所有对象，而是给出影响范围、不可逆后果和清晰的下钻入口。
- 来源：[Webflow Updates - Merge summary](https://webflow.com/updates/merge-summary)

## 卡片模式怎么落到 T3X

推荐采用“两层卡片”，不是所有内容都套圆角容器：

1. **变更列表层：轻卡/行卡。** 每个 changed node 一行，固定包含 operation、路径、类型化摘要、validation、冲突数、viewed 状态。大量变更时像 Sanity，而不是 Figma 的大缩略图网格。
2. **当前对象层：一张主变更卡。** 只展开当前节点，卡头放 `SET / ADD / REMOVE`、路径、Pending/Verified/Conflict；卡体按类型展示 old/new；卡脚放 sources、statements、why trusted 和评论。
3. **申请层：独立 readiness/decision rail。** 像 Unleash/LaunchDarkly 一样展示 proposal 生命周期、reviewer、replay、external statements、冲突和 Accept/Reject/Override，不把这些状态重复塞进每张对象卡。

建议的主变更卡信息顺序：

| 区域 | 必备信息 | 展示规则 |
| --- | --- | --- |
| Card header | operation、节点名/路径、状态、未解决数 | 一行完成对象识别；颜色必须同时配文字 |
| Semantic summary | 一句业务含义，例如“checkout-api replicas 由 3 调到 4” | 默认先于原始 YAML/JSON |
| Typed diff | old/new 或 added/removed items | 标量用紧凑双行；长文本分栏；对象按 key；数组按 item |
| Evidence summary | 2 sources、1 statement、receipt 状态 | 默认折叠，不在卡内继续套两张大 Evidence 卡 |
| Actions | Comment、Mark viewed、Open source、Edit proposal | 对象动作留在卡内；最终 Accept/Commit 留在全局决策区 |

最适合 T3X 的组合不是纯 Figma 卡片墙，而是：**Sanity 的高密度对象列表 + Unleash 的主变更请求卡 + Airtable 的字段 old/new 表达 + Webflow 的提交前影响摘要**。这样既有“卡片化”，又不会牺牲工作台的扫描效率和治理状态真相。

## 证据限制

- 本次没有完成登录态下的逐步交互、键盘、focus、responsive 或无障碍测试。
- GitHub、Hugging Face、GitLab、Graphite 和 Gerrit 图来自其官方文档/产品素材；Cursor 的完整界面图使用了第三方产品示例和官方社区截图，并用当前官方文档核对功能语义。
- 截图只能支持信息架构和视觉层级判断，不能证明真实权限、校验或提交行为。
