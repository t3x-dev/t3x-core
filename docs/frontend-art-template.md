# T3X 前端设计模板

> 状态：生效中
> 最后更新：2026-02-10
> 范围：apps/web (t3x-webui)
> 目的：告诉前端同事**"长什么样"** — 可视化 Token 目录、组件组合模板、页面布局蓝图、升级方向。
>
> **与现有文档的关系**：
> - `frontend-design-principles.md` → **为什么**（产品哲学、交互设计、三层模型）
> - `frontend-rules.md` → **怎么写代码**（架构规则、Store 规范、代码约定）
> - **本文档** → **长什么样**（Token 目录、组合蓝图、布局模板、视觉升级提案）

---

## 目录

1. [设计系统规格](#1-设计系统规格)
2. [页面布局模板](#2-页面布局模板)
3. [组件模板](#3-组件模板)
4. [组件画廊设计指南](#4-组件画廊设计指南)

---

## 1. 设计系统规格

所有 Token 的权威来源是 `globals.css`（591 行）和 `lib/theme.ts`。本节是**完整目录**，不是概述。

### 1.1 色彩系统

#### 品牌色

品牌叙事：**Orange（待处理/草稿）→ Blue（已提交/稳定）**，对应 T3X 领结 Logo 渐变。

| 角色 | CSS 变量 | 值 | Tailwind 用法 |
|------|----------|-----|---------------|
| 品牌色 | `--color-brand` | `#4f46e5` | 仅主题层使用 |
| 品牌色悬停 | `--color-brand-hover` | `#4338ca` | — |
| 品牌色浅 | `--color-brand-light` | `#eef2ff` | — |
| 品牌色柔和 | `--color-brand-muted` | `#818cf8` | — |
| 主色 | `--color-primary` | oklch(0.55 0.22 260) | `bg-primary` `text-primary` |
| 主色悬停 | `--color-primary-hover` | `#2563eb` | — |
| 主色浅 | `--color-primary-light` | `#dbeafe` | — |
| 强调色 | `--color-accent` | `#f59e0b` | — |
| 强调色悬停 | `--color-accent-hover` | `#d97706` | — |
| 强调色浅 | `--color-accent-light` | `#fef3c7` | — |

#### 语义状态色（`lib/theme.ts` semantic 对象）

| 语义 | bg | border | text | accent | 用途 |
|------|-----|--------|------|--------|------|
| commit | `blue-50` (#eff6ff) | `blue-200` (#bfdbfe) | `blue-700` (#1d4ed8) | `blue-600` (#2563eb) | 已提交节点 |
| pending | `orange-50` (#fff7ed) | `orange-200` (#fed7aa) | `orange-700` (#c2410c) | `orange-500` (#f97316) | 草稿节点 |
| branch | `#fffbeb` | `#fde68a` | `#92400e` | `#f59e0b` | 分支标识 |
| conversation | `blue-50` | `#c7d2fe` | `#4338ca` | `#6366f1` | 对话节点 |
| leaf | `#ecfdf5` | `#a7f3d0` | `#065f46` | `#10b981` | Leaf 输出 |
| success | `#ecfdf5` | `#a7f3d0` | `#065f46` | `#10b981` | 成功反馈 |
| error | `#fef2f2` | `#fecaca` | `#991b1b` | `#ef4444` | 错误反馈 |
| warning | `#fffbeb` | `#fde68a` | `#92400e` | `#f59e0b` | 警告反馈 |

每个语义色还有 badge 渐变：

```css
commit.badge:  linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)  /* 白色文字 */
pending.badge: linear-gradient(135deg, #fb923c 0%, #f97316 100%)  /* 白色文字 */
branch.badge:  linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)  /* 深色文字 #78350f */
```

#### 功能色（通用）

| 角色 | 变量 | 值 | 浅色搭配 |
|------|------|-----|---------|
| 成功 | `--color-success` | `#10b981` | `--color-success-light` `#d1fae5` |
| 错误 | `--color-error` | `#ef4444` | `--color-error-light` `#fee2e2` |
| 警告 | `--color-warning` | `#f59e0b` | `--color-warning-light` `#fef3c7` |

#### 中性色（`lib/theme.ts` brand.slate）

| 色阶 | 值 | 典型用途 |
|-------|-----|---------|
| slate-50 | `#f8fafc` | `--color-bg` 页面背景 |
| slate-100 | `#f1f5f9` | `--color-bg-subtle` 次要背景 |
| slate-200 | `#e2e8f0` | `--color-border` 边框 |
| slate-300 | `#cbd5e1` | `--color-text-secondary`（暗色） |
| slate-400 | `#94a3b8` | `--color-text-muted` 辅助文字 |
| slate-500 | `#64748b` | 暗色模式辅助文字 |
| slate-600 | `#475569` | `--color-text-secondary` 次要文字 |
| slate-700 | `#334155` | 暗色模式边框 |
| slate-800 | `#1e293b` | `--color-bg-white`（暗色）卡片背景 |
| slate-900 | `#0f172a` | `--color-bg`（暗色）页面背景 / `--color-text` 正文文字 |
| slate-950 | `#020617` | Logo 背景 |

#### oklch Token（shadcn/ui 兼容层）

`@theme inline` 和 `:root` 中定义了完整的 oklch 色值，供 Tailwind v4 编译使用：

| Token | 亮色 | 暗色 |
|-------|------|------|
| `--background` | oklch(0.99 0.002 250) | oklch(0.13 0.02 260) |
| `--foreground` | oklch(0.13 0.02 260) | oklch(0.97 0.005 260) |
| `--card` | oklch(1 0 0) | oklch(0.18 0.015 260) |
| `--primary` | oklch(0.55 0.22 260) | oklch(0.65 0.2 260) |
| `--secondary` | oklch(0.96 0.005 260) | oklch(0.22 0.015 260) |
| `--muted` | oklch(0.96 0.005 260) | oklch(0.22 0.015 260) |
| `--destructive` | oklch(0.55 0.22 25) | oklch(0.6 0.2 25) |
| `--border` | oklch(0.91 0.005 260) | oklch(0.28 0.015 260) |
| `--ring` | oklch(0.55 0.22 260) | oklch(0.65 0.2 260) |

#### 图表色

| Token | 亮色 oklch | 暗色 oklch |
|-------|-----------|-----------|
| `--chart-1` | (0.646 0.222 41.116) | (0.488 0.243 264.376) |
| `--chart-2` | (0.6 0.118 184.704) | (0.696 0.17 162.48) |
| `--chart-3` | (0.398 0.07 227.392) | (0.769 0.188 70.08) |
| `--chart-4` | (0.828 0.189 84.429) | (0.627 0.265 303.9) |
| `--chart-5` | (0.769 0.188 70.08) | (0.645 0.246 16.439) |

#### 暗色模式

暗色模式通过 `.dark` 类覆盖 CSS 变量。关键差异：

| Token | 亮色 | 暗色 |
|-------|------|------|
| 页面背景 | `#f8fafc` | `#0f172a` |
| 正文文字 | `#0f172a` | `#f8fafc` |
| 次要文字 | `#475569` | `#cbd5e1` |
| 辅助文字 | `#94a3b8` | `#64748b` |
| 卡片背景 | `#ffffff` | `#1e293b` |
| 边框 | `#e2e8f0` | `#334155` |

> **升级提案 1：oklch 冲突合并**
>
> `globals.css` 中存在两个 `.dark` 块定义了不同的 oklch 值（行 174-225 vs 行 503-535）。
> 第一个 `.dark` 使用品牌色调（hue 260），第二个使用无彩色（hue 0）。
> 建议合并为统一的品牌色调暗色方案，消除运行时覆盖不确定性。

> **升级提案 2：Diff 色彩子系统**
>
> 当前 Diff 颜色硬编码在 4+ 组件中（DiffStatsBar、DiffDisplayView、WordDiffDisplay、AssertionItem）。
> 建议提取为 CSS Token：
> ```css
> --diff-added-bg:    theme(colors.green.50);     /* 暗色: green-950/30 */
> --diff-removed-bg:  theme(colors.red.50);       /* 暗色: red-950/30 */
> --diff-modified-bg: theme(colors.amber.50);     /* 暗色: amber-950/30 */
> --diff-identical-bg: theme(colors.slate.50/50);  /* 暗色: slate-950/30 */
> --diff-added-border:    theme(colors.green.300); /* 暗色: green-700 */
> --diff-removed-border:  theme(colors.red.300);   /* 暗色: red-700 */
> --diff-modified-border: theme(colors.amber.300); /* 暗色: amber-700 */
> ```

> **升级提案 3：Highlight 色彩子系统**
>
> TurnBubble 中 `highlightColors` 硬编码为 4 种颜色：
> ```
> yellow:    bg-yellow-200 / dark:bg-yellow-800/50
> green:     bg-green-200  / dark:bg-green-800/50
> deepGreen: bg-green-500 text-white
> deepRed:   bg-red-500 text-white
> ```
> 建议提取为 `--highlight-*` CSS Token，统一 TurnBubble 和 SourceContextView 的高亮样式。

### 1.2 排版系统

#### 字体

```css
font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: var(--font-geist-mono), ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace;
```

Geist 是 Vercel 出品的字体，带有 `rlig` 和 `calt` 特性，开启 `optimizeLegibility` 和 `antialiased` 渲染。

#### 8 级字号

| Token | 大小 | 行高 | 用途 | Tailwind |
|-------|------|------|------|----------|
| `--text-xs` | 0.75rem (12px) | 1rem (16px) | 标签、时间戳、Badge 文字 | `text-xs` |
| `--text-sm` | 0.8125rem (13px) | 1.25rem (20px) | 次要文字、列表项 | `text-sm` |
| `--text-base` | 0.875rem (14px) | 1.375rem (22px) | **正文**（项目默认） | `text-base` 或 `text-sm`(Tailwind) |
| `--text-md` | 0.9375rem (15px) | 1.5rem (24px) | 强调正文 | — |
| `--text-lg` | 1rem (16px) | 1.5rem (24px) | 标题 | `text-lg` |
| `--text-xl` | 1.125rem (18px) | 1.75rem (28px) | 区段标题 | `text-xl` |
| `--text-2xl` | 1.25rem (20px) | 1.875rem (30px) | 页面标题 | `text-2xl` |
| `--text-3xl` | 1.5rem (24px) | 2rem (32px) | 大标题 | `text-3xl` |

> 注意：项目中 Tailwind `text-sm` = 0.875rem (14px)，与 CSS Token `--text-sm` (13px) 不同。
> 实际使用中 `text-sm` 是正文默认大小，`text-xs` 用于辅助信息。

#### 行高

| Token | 值 | 用途 |
|-------|-----|------|
| `--leading-tight` | 1.25 | 标题、紧凑行 |
| `--leading-snug` | 1.375 | 正文（默认） |
| `--leading-normal` | 1.5 | 段落 |
| `--leading-relaxed` | 1.625 | 宽松阅读 |

#### 字重

| 名称 | 值 | 用途 |
|------|-----|------|
| normal | 400 | 正文 |
| medium | 500 | 强调、关键词 |
| semibold | 600 | 标题、按钮文字 |
| bold | 700 | 页面大标题 |

#### 字距

| Token | 值 | 用途 |
|-------|-----|------|
| tighter | -0.02em | 大标题 |
| tight | -0.01em | 中标题（`tracking-tight`） |
| normal | 0 | 正文 |
| wide | 0.01em | Badge 文字 |
| wider | 0.02em | 全大写标签 |

### 1.3 间距系统

基准单位：**4px**。

| 语义名 | CSS Token | 值 | Tailwind | 常见用途 |
|--------|-----------|-----|----------|---------|
| xs | `--spacing-xs` | 4px | `p-1` `gap-1` | 图标与文字间距 |
| sm | `--spacing-sm` | 8px | `p-2` `gap-2` | 紧凑内边距 |
| md | `--spacing-md` | 12px | `p-3` `gap-3` | 列表项间距、卡片内部 |
| lg | `--spacing-lg` | 16px | `p-4` `gap-4` | 标准内边距 |
| xl | `--spacing-xl` | 24px | `p-6` `gap-6` | 区段间距、页面边距 |
| 2xl | `--spacing-2xl` | 32px | `p-8` `gap-8` | 大区块分隔 |
| 3xl | `--spacing-3xl` | 48px | `p-12` | 空状态垂直居中 |

**常用 Tailwind 间距模式**：

```
页面外边距：     p-6
区段间间距：     gap-6
列表项间距：     gap-3
卡片内边距：     p-4
紧凑内边距：     p-3
标题与内容：     mb-2 到 mb-4
按钮间距：       gap-2
图标与文字：     gap-1 到 gap-2
```

### 1.4 圆角系统

| Token | 值 | 计算 | 用途 |
|-------|-----|------|------|
| `--radius-sm` | 6px → calc(0.75rem - 4px) | 基准-4px | 小按钮、Badge、内嵌元素 |
| `--radius-md` | 8px → calc(0.75rem - 2px) | 基准-2px | 输入框、标准按钮 |
| `--radius-lg` | 12px → 0.75rem | **基准** | 卡片、弹窗 |
| `--radius-xl` | 16px → calc(0.75rem + 4px) | 基准+4px | 大卡片、模态框 |
| `--radius-2xl` | 20px → calc(0.75rem + 8px) | 基准+8px | Canvas 节点 |
| `--radius-full` | 9999px | — | 药丸形 Badge、头像 |

**语义用途映射**：

```
Badge / Tag:           rounded-full (9999px)
按钮:                  rounded-md (8px)
输入框:                rounded-md (8px)
卡片:                  rounded-xl (16px)
Canvas 节点:           rounded-2xl (20px)
弹窗 / Modal:          rounded-xl (16px)
头像:                  rounded-full
关键词高亮:            rounded (4px)
```

### 1.5 阴影与层次

#### 6 级阴影

| Token | 亮色 | 暗色 | 用途 |
|-------|------|------|------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | `... 0.3)` | 微妙凸起 |
| `--shadow-sm` | `0 1px 3px ..., 0 1px 2px ...` | 加深 | 卡片、输入框 |
| `--shadow-md` | `0 4px 6px -1px ...` | 加深 | 悬停卡片 |
| `--shadow-lg` | `0 10px 25px -5px ...` | 加深 | 弹窗 |
| `--shadow-xl` | `0 20px 40px -10px ...` | — | 大弹窗 |
| `--shadow-glow` | `0 0 0 1px rgba(59,130,246,0.1), 0 4px 16px rgba(59,130,246,0.12)` | Indigo 版 | 焦点/选中高亮 |

#### 语义 Glow（`lib/theme.ts` shadows.glow）

| 颜色 | 值 | 用途 |
|------|-----|------|
| blue | `0 0 0 1px rgba(59,130,246,0.1), 0 4px 16px rgba(59,130,246,0.12)` | Commit 节点选中 |
| orange | `0 0 0 1px rgba(249,115,22,0.1), 0 4px 16px rgba(249,115,22,0.12)` | Pending 节点选中 |
| indigo | `0 0 0 1px rgba(99,102,241,0.1), 0 4px 16px rgba(99,102,241,0.12)` | Conversation 节点选中 |

#### 6 级 Elevation（交互状态用）

| Token | 亮色 | 用途 |
|-------|------|------|
| `--elevation-0` | none | 静止 |
| `--elevation-1` | `0 1px 2px rgba(0,0,0,0.04)` | 默认 |
| `--elevation-2` | `0 2px 4px ..., 0 1px 2px ...` | 悬停 |
| `--elevation-3` | `0 4px 8px ..., 0 2px 4px ...` | 按下反弹 |
| `--elevation-4` | `0 8px 16px ..., 0 4px 8px ...` | 拖拽中 |
| `--elevation-5` | `0 16px 32px ..., 0 8px 16px ...` | 浮动面板 |

### 1.6 过渡与动画

#### CSS 层（`globals.css`）

**Transition**：

| Token | 值 | 用途 |
|-------|-----|------|
| `--transition-fast` | 120ms ease-smooth | 按钮悬停、图标变色 |
| `--transition-normal` | 200ms ease-smooth | 卡片悬停、展开折叠 |
| `--transition-slow` | 300ms ease-smooth | 面板滑入、大区域切换 |
| `--transition-spring` | 400ms ease-spring | 弹性反馈 |

**Duration**：

| Token | 值 |
|-------|-----|
| `--duration-instant` | 100ms |
| `--duration-fast` | 150ms |
| `--duration-normal` | 250ms |
| `--duration-slow` | 400ms |

**Easing**：

| Token | 值 | 用途 |
|-------|-----|------|
| `--ease-smooth` | cubic-bezier(0.4, 0, 0.2, 1) | 通用 |
| `--ease-out` | cubic-bezier(0, 0, 0.2, 1) | 入场 |
| `--ease-in` | cubic-bezier(0.4, 0, 1, 1) | 退场 |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | 弹性效果 |

**CSS Keyframes**（`globals.css`）：

| 动画名 | 用途 |
|--------|------|
| `edge-flow` | ReactFlow Edge 流动（stroke-dashoffset 24→0） |
| `handle-pulse` | 活跃连接点脉冲 |
| `shimmer` | 骨架屏微光 |
| `shimmer-slide` | ShimmerButton 光泽滑动 |
| `spin-around` | ShimmerButton 旋转边框 |
| `shiny-text` | 闪光文字效果 |

#### Framer Motion 层（`lib/motion.ts`）

**Spring 配置**：

| 名称 | stiffness | damping | 用途 |
|------|-----------|---------|------|
| snappy | 400 | 25 | 按钮、开关等微交互 |
| gentle | 200 | 20 | 模态框、面板等大元素 |
| bouncy | 300 | 15 | 通知、Badge 等有趣动画 |
| smooth | 150 | 20 | 悬停状态、微妙移动 |

**预设 Variants**：

| 名称 | 效果 | 典型使用 |
|------|------|---------|
| `fadeIn` | opacity 0→1 | 通用淡入 |
| `scaleIn` | opacity 0→1 + scale 0.95→1 | 模态框、Tooltip |
| `slideUp` | opacity 0→1 + y 8→0 | Toast、面板 |
| `slideDown` | opacity 0→1 + y -8→0 | 下拉菜单 |
| `nodeEnter` | opacity 0→1 + scale 0.9→1 (bouncy) | Canvas 节点创建 |
| `shake` | x [-4,4,-4,4,0] | 错误抖动 |
| `staggerContainer` | staggerChildren: 0.05, delay: 0.1 | 列表容器 |
| `staggerItem` | opacity 0→1 + y 8→0 (gentle) | 列表项 |

**交互状态**：

```typescript
buttonTap   = { scale: 0.97, duration: 0.1 }   // 按钮按下
buttonHover = { scale: 1.02, spring: smooth }   // 按钮悬停
nodeHover   = { scale: 1.02, spring: smooth }   // 节点悬停
nodeSelected = { scale: 1.01, spring: snappy }  // 节点选中
```

**Reduced Motion**：完整支持 `useReducedMotion` Hook + `reducedMotion.*` 替代变体 + `@media (prefers-reduced-motion: reduce)` CSS 回退。

### 1.7 Canvas 专用 Token

#### Grid 与节点尺寸

| Token | 值 | 计算 |
|-------|-----|------|
| `--canvas-grid-size` | 16px | 基准网格 |
| `--conversation-node-height` | 128px | 8 × 16 |
| `--draft-node-height` | 160px | 10 × 16 |
| `--commit-node-height` | 160px | 10 × 16 |
| `--canvas-node-min-width` | 224px | 14 × 16 |
| `--leaf-node-height` | 64px | 4 × 16 |
| `--leaf-node-width` | ~149px | minWidth × 2/3 |

TypeScript 对应值（`lib/theme.ts` canvas 对象）：

```typescript
canvas.grid = 16
canvas.node.minWidth = 224
canvas.node.conversation.height = 128
canvas.node.draft.height = 160
canvas.node.commit.height = 160
canvas.node.leaf = { height: 64, width: 149 }
```

#### Edge 颜色

| Token | 亮色 | 暗色 |
|-------|------|------|
| `--edge-color` | `#94a3b8` (slate-400) | `#475569` (slate-600) |
| `--edge-active-color` | `#3b82f6` (blue-500) | `#818cf8` (indigo-400) |
| `--edge-selected-color` | `#2563eb` (blue-600) | `#6366f1` (indigo-500) |

#### Handle 样式

```css
.react-flow__handle {
  width: 12px;  height: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg-white);
  box-shadow: var(--shadow-sm);
}
.react-flow__handle:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  transform: scale(1.2);
}
/* 左 Handle 圆角偏右，右 Handle 圆角偏左 */
.react-flow__handle-left  { border-radius: 4px 8px 8px 4px; }
.react-flow__handle-right { border-radius: 8px 4px 4px 8px; }
```

#### 节点 Tailwind 类（`lib/theme.ts` getNodeClasses）

| 类型 | default | hover | selected |
|------|---------|-------|----------|
| commit | `bg-blue-50 border-blue-200 text-blue-700` | `bg-blue-100 border-blue-400 shadow-md` | `border-blue-500 ring-2 ring-blue-500/20 ring-offset-2` |
| pending | `bg-orange-50 border-orange-200 text-orange-700` | `bg-orange-100 border-orange-400 shadow-md` | `border-orange-500 ring-2 ring-orange-500/20 ring-offset-2` |
| branch | `bg-amber-50 border-amber-200 text-amber-700` | `bg-amber-100 border-amber-400 shadow-md` | `border-amber-500 ring-2 ring-amber-500/20 ring-offset-2` |
| conversation | `bg-indigo-50 border-indigo-200 text-indigo-700` | `bg-indigo-100 border-indigo-400 shadow-md` | `border-indigo-500 ring-2 ring-indigo-500/20 ring-offset-2` |
| leaf | `bg-emerald-50 border-emerald-200 text-emerald-700` | `bg-emerald-100 border-emerald-400 shadow-md` | `border-emerald-500 ring-2 ring-emerald-500/20 ring-offset-2` |

所有节点基础类：`rounded-2xl border-2 transition-all duration-200`

---

## 2. 页面布局模板

### 2.1 App Shell

**来源**：`ClientLayout.tsx`

```
┌──────────────────────────────────────────────────────┐
│ ErrorBoundary                                        │
│ ┌────┬───────────────────────────────────────────┐   │
│ │    │                                           │   │
│ │ S  │           <main>                          │   │
│ │ i  │           ml-16 flex-1 overflow-hidden    │   │
│ │ d  │                                           │   │
│ │ e  │           {children}                      │   │
│ │ b  │                                           │   │
│ │ a  │                                           │   │
│ │ r  │                                           │   │
│ │    │                                           │   │
│ │64px│                                           │   │
│ └────┴───────────────────────────────────────────┘   │
│ Toaster (bottom-right, richColors, closeButton)      │
│ CommandPalette (Cmd+K)                               │
└──────────────────────────────────────────────────────┘
```

**关键类名**：
```html
<div class="flex min-h-screen bg-muted/30">
  <Sidebar />                              <!-- 64px 固定宽度 -->
  <main class="ml-16 flex flex-1 flex-col overflow-hidden">
    {children}
  </main>
  <Toaster position="bottom-right" richColors closeButton />
  <CommandPalette />
</div>
```

**约束**：
- Sidebar 宽度 64px，固定不可收缩
- main 区域通过 `ml-16` 避让 Sidebar
- `overflow-hidden` 防止整体滚动（各页面自行管理滚动）
- ErrorBoundary 包裹整个 Shell，兜底渲染错误 + hydration 自动恢复
- Toast 注入通过 Store 的 `setNotifyCallback(showToast)`

> **升级提案：Canvas 底部状态栏**
>
> 参考 VS Code 底部状态栏，在 Canvas 页面添加持久状态信息：
> ```
> [main] | 12 commits | 3 branches | 2 leaves | Last sync: 5s ago | Connected
> ```
> 位置：Canvas 底部，h-6，bg-muted，text-xs。

### 2.2 列表页

**来源**：`app/page.tsx`（项目列表）

```
┌────────────────────────────────────────────────────┐
│  p-6                                               │
│  ┌──────────────────────────────────────────────┐  │
│  │ header: flex items-center justify-between     │  │
│  │  ┌──────────┐              ┌──────────────┐  │  │
│  │  │ h1 2xl   │              │ ShimmerButton │  │  │
│  │  │ bold     │              │ + New Project │  │  │
│  │  └──────────┘              └──────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
│                     gap-6                          │
│  ┌──────────────────────────────────────────────┐  │
│  │ flex flex-col gap-3                           │  │
│  │  ┌──────────────────────────────────────────┐ │  │
│  │  │ Card > CardContent > flex items-center   │ │  │
│  │  │  项目名 | 统计 Badge | 状态 Badge | 时间  │ │  │
│  │  └──────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────┐ │  │
│  │  │ (同上)                                   │ │  │
│  │  └──────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

**关键类名**：
```html
<div class="flex h-full flex-col gap-6 overflow-auto p-6">
  <header class="flex items-center justify-between">
    <h1 class="text-2xl font-bold tracking-tight">Projects</h1>
    <!-- 操作按钮 -->
  </header>
  <div class="flex flex-col gap-3">
    <!-- 每个项目一个 Card -->
    <Card>
      <CardContent class="flex items-center gap-4 p-4">
        <!-- 内容 -->
      </CardContent>
    </Card>
  </div>
</div>
```

**约束**：
- 页面级 `p-6`，标题与内容间 `gap-6`
- 列表项间 `gap-3`
- 卡片内 `p-4`，内容 `gap-4`
- 标题用 `text-2xl font-bold tracking-tight`
- 统计数字用 `hidden sm:flex` 响应式隐藏
- 空状态用 `Card border-dashed` + `EmptyState` 组合

### 2.3 Canvas 全屏

**来源**：`project/[projectId]/page.tsx`

```
┌────────────────────────────────────────────────────┐
│ flex h-full flex-col                               │
│ ┌──────────────────────────────────────────────┐   │
│ │ header h-12 shrink-0 border-b bg-background  │   │
│ │  项目名 | 模式切换                            │   │
│ └──────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────┐   │
│ │                                              │   │
│ │  CanvasWorkspace (ReactFlow)                 │   │
│ │  flex-1                                      │   │
│ │                                              │   │
│ │  ┌─────┐    ┌─────┐    ┌─────┐              │   │
│ │  │Conv │───→│Draft│───→│Commit│              │   │
│ │  │Node │    │Node │    │Node │              │   │
│ │  └─────┘    └─────┘    └──┬──┘              │   │
│ │                           │                  │   │
│ │                        ┌──▼──┐              │   │
│ │                        │Leaf │              │   │
│ │                        │Node │              │   │
│ │                        └─────┘              │   │
│ │                                              │   │
│ │  [Minimap]        [ZoomSlider]               │   │
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**关键类名**：
```html
<div class="flex h-full flex-col">
  <CanvasWorkspace /> <!-- 内部: header h-12 + ReactFlow flex-1 -->
</div>
```

**约束**：
- 整体 `h-full flex-col`，撑满父容器
- Header 固定 `h-12 shrink-0`
- ReactFlow 区域 `flex-1` 占满剩余空间
- 模式切换（Editor/Execution）用药丸形标签组，绝对定位在 header/canvas 交界处
- 不可变节点和上游节点锁定（committed 不可编辑）

### 2.4 详情页

**来源**：`leaf/[leafId]/page.tsx`

```
┌────────────────────────────────────────────────────┐
│ flex h-full flex-col                               │
│ ┌──────────────────────────────────────────────┐   │
│ │ header h-14 shrink-0 border-b bg-background  │   │
│ │  ← 返回 | 标题 + 类型 Badge + 日期           │   │
│ │                    Pin | Generate | Validate  │   │
│ └──────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────┐   │
│ │ flex-1 overflow-auto p-6                      │   │
│ │ ┌──────────────────────────────────────────┐  │   │
│ │ │ mx-auto max-w-4xl space-y-6              │  │   │
│ │ │                                          │  │   │
│ │ │ ┌──────────────────────────────────────┐ │  │   │
│ │ │ │ Section: Source Content & Constraints │ │  │   │
│ │ │ └──────────────────────────────────────┘ │  │   │
│ │ │                                          │  │   │
│ │ │ ┌──────────────────────────────────────┐ │  │   │
│ │ │ │ Section: Generation Instructions      │ │  │   │
│ │ │ └──────────────────────────────────────┘ │  │   │
│ │ │                                          │  │   │
│ │ │ ┌──────────────────────────────────────┐ │  │   │
│ │ │ │ Section: Output                       │ │  │   │
│ │ │ └──────────────────────────────────────┘ │  │   │
│ │ │                                          │  │   │
│ │ │ ┌──────────────────────────────────────┐ │  │   │
│ │ │ │ Section: Validation Results           │ │  │   │
│ │ │ └──────────────────────────────────────┘ │  │   │
│ │ └──────────────────────────────────────────┘  │   │
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**关键类名**：
```html
<div class="flex h-full flex-col">
  <header class="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
    <!-- 返回按钮 + 标题 + 操作按钮 -->
  </header>
  <div class="flex-1 overflow-auto p-6">
    <div class="mx-auto max-w-4xl space-y-6">
      <!-- 各 Section -->
    </div>
  </div>
</div>
```

**约束**：
- Header `h-14`（比 Canvas 的 `h-12` 略高，容纳更多按钮）
- 内容区 `overflow-auto` 自身滚动
- 内容居中 `mx-auto max-w-4xl`（最大宽度 896px）
- Section 间距 `space-y-6`
- 每个 Section 使用 `rounded-lg border bg-card` + `border-b p-4` header + `p-4` body

> **升级提案：面包屑导航**
>
> 当前详情页只有 ← 返回按钮。建议增加面包屑：
> ```
> Project Name > Commit abc123 > Leaf leaf_xxx
> ```
> 使用 `text-sm text-muted-foreground` + 可点击链接。

### 2.5 全屏工作台

**来源**：`merge/[mergeId]/page.tsx`

```
┌────────────────────────────────────────────────────┐
│ h-screen bg-background                             │
│ ┌──────────────────────────────────────────────┐   │
│ │                                              │   │
│ │  MergeWorkspace                              │   │
│ │  （独立于 App Shell，无 Sidebar）              │   │
│ │                                              │   │
│ │  ┌──────────────────────────────────────┐    │   │
│ │  │ DiffStatsBar                         │    │   │
│ │  │ identical | modified | added | removed│    │   │
│ │  └──────────────────────────────────────┘    │   │
│ │  ┌───────────────┬──────────────────────┐    │   │
│ │  │   Source       │     Target           │    │   │
│ │  │   (左栏)       │     (右栏)           │    │   │
│ │  │               │                      │    │   │
│ │  │  句子对比      │    句子对比           │    │   │
│ │  │  + 决策按钮    │    + 决策按钮         │    │   │
│ │  └───────────────┴──────────────────────┘    │   │
│ │  ┌──────────────────────────────────────┐    │   │
│ │  │ Footer: 进度 + 确认合并              │    │   │
│ │  └──────────────────────────────────────┘    │   │
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**关键特征**：
- `h-screen` 全屏，**脱离 App Shell** 的 Sidebar（沉浸式体验）
- 独立 ErrorBoundary + 返回按钮
- 内部由 `MergeWorkspace` 组件管理布局

> **升级提案：长页面 Sticky 区段头**
>
> Diff/Merge 视图中句子列表可能很长。建议 DiffStatsBar 使用 `sticky top-0 z-10` 固定在顶部，
> 滚动时持续可见统计信息。

### 2.6 响应式网格

**来源**：`insights/page.tsx`

```
┌────────────────────────────────────────────────────┐
│ flex h-full flex-col gap-6 overflow-auto p-6       │
│                                                    │
│  header: icon + h1 "Insights"                      │
│                                                    │
│  Tabs: [Ledger] [Latest Commits]                   │
│                                                    │
│  ┌────────────────────────────────────────────┐    │
│  │ grid gap-4 sm:grid-cols-2 lg:grid-cols-3   │    │
│  │                                            │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐              │    │
│  │  │Card 1│ │Card 2│ │Card 3│              │    │
│  │  │      │ │      │ │      │              │    │
│  │  └──────┘ └──────┘ └──────┘              │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐              │    │
│  │  │Card 4│ │Card 5│ │Card 6│              │    │
│  │  └──────┘ └──────┘ └──────┘              │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  [Load more (N remaining)]                         │
└────────────────────────────────────────────────────┘
```

**关键类名**：
```html
<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {entries.map(entry => <SemanticCard key={entry.id} entry={entry} />)}
</div>
```

**约束**：
- 移动端 1 列，`sm:` 2 列，`lg:` 3 列
- 网格间距 `gap-4`
- 分页加载："Load more" 文字按钮（非 Button 组件）
- 空状态使用 `EmptyState` 组件

---

## 3. 组件模板

### 3.1 按钮系统

**来源**：`components/ui/button.tsx`

#### 11 个变体

| 变体 | 样式 | 适用场景 |
|------|------|---------|
| `default` | `bg-primary text-primary-foreground` | 主操作（保存、确认） |
| `destructive` | `bg-destructive text-white` | 删除、危险操作 |
| `outline` | `border bg-background shadow-xs` | 次要操作（取消、筛选） |
| `secondary` | `bg-secondary text-secondary-foreground` | 辅助操作 |
| `ghost` | 透明，hover 时 `bg-accent` | 工具栏图标、内嵌操作 |
| `link` | `text-primary underline-offset-4` | 内嵌链接 |
| `commit` | `bg-gradient-to-r from-blue-500 to-blue-600 text-white` | 提交操作 |
| `pending` | `bg-gradient-to-r from-orange-400 to-orange-500 text-white` | 草稿操作 |
| `branch` | `bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950` | 分支操作 |
| `canvas-ghost` | `text-slate-600 hover:bg-slate-100` | Canvas 工具栏 |
| `canvas-outline` | `border bg-white/80 backdrop-blur-sm` | Canvas 次要操作 |

#### 6 种尺寸

| 尺寸 | 类 | 用途 |
|------|-----|------|
| `default` | `h-9 px-4 py-2` | 标准按钮 |
| `sm` | `h-8 px-3` | 紧凑按钮、卡片内操作 |
| `lg` | `h-10 px-6` | 强调按钮 |
| `icon` | `size-9` | 图标按钮 |
| `icon-sm` | `size-8` | 小图标按钮 |
| `icon-lg` | `size-10` | 大图标按钮 |

#### 3 种动画风味

| 组件 | 动画效果 | 使用场景 |
|------|---------|---------|
| `Button` | 无动画（纯 CSS transition） | 通用，绝大多数场景 |
| `AnimatedButton` | Framer Motion `whileTap={scale:0.97}` + `whileHover={scale:1.02}` | 需要触感反馈的交互按钮 |
| `PulseButton` | `boxShadow` 脉冲循环动画 | 主 CTA，需要吸引用户注意 |

#### ShimmerButton（`components/ui/shimmer-button.tsx`）

特殊按钮，带旋转光泽边框效果：
```tsx
<ShimmerButton
  background="linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)"
  shimmerColor="#ffffff"
  className="gap-2 text-sm font-semibold"
>
  <Plus /> New Project
</ShimmerButton>
```

**选择指南**：

```
需要吸引注意？         → PulseButton 或 ShimmerButton
需要触感反馈？         → AnimatedButton
主操作（提交/保存）？   → Button variant="commit"
次要操作（取消/关闭）？ → Button variant="outline" 或 "ghost"
危险操作（删除）？      → Button variant="destructive"
Canvas 工具栏？        → Button variant="canvas-ghost" 或 "canvas-outline"
内嵌链接？             → Button variant="link"
```

### 3.2 徽章系统

**来源**：`components/ui/badge.tsx`

#### 14 个变体

**通用变体**（4 个）：

| 变体 | 样式 | 用途 |
|------|------|------|
| `default` | `bg-primary text-primary-foreground` | 通用标签 |
| `secondary` | `bg-secondary text-secondary-foreground` | 次要标签 |
| `destructive` | `bg-destructive text-white` | 错误/危险标签 |
| `outline` | 仅边框 + 前景色 | 状态指示（配合 cn() 着色） |

**语义变体**（7 个渐变实心）：

| 变体 | 渐变方向 | 文字色 | 用途 |
|------|---------|--------|------|
| `commit` | `from-blue-500 to-blue-600` | 白 | 已提交状态 |
| `pending` | `from-orange-400 to-orange-500` | 白 | 草稿状态 |
| `branch` | `from-amber-400 to-amber-500` | `amber-950` | 分支标识 |
| `main` | `from-blue-600 to-indigo-600` | 白 | 主分支 |
| `conversation` | `from-indigo-400 to-indigo-500` | 白 | 对话标识 |
| `leaf` | `from-emerald-400 to-emerald-500` | 白 | Leaf 标识 |
| `success` | `from-emerald-500 to-emerald-600` | 白 | 成功状态 |
| `warning` | `from-amber-500 to-amber-600` | 白 | 警告状态 |

**Subtle 变体**（3 个浅色背景）：

| 变体 | 亮色样式 | 暗色样式 | 用途 |
|------|---------|---------|------|
| `commit-subtle` | `border-blue-200 bg-blue-50 text-blue-700` | `dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300` | 内嵌 commit 状态 |
| `pending-subtle` | `border-orange-200 bg-orange-50 text-orange-700` | 同上 orange | 内嵌 pending 状态 |
| `branch-subtle` | `border-amber-200 bg-amber-50 text-amber-700` | 同上 amber | 内嵌分支状态 |

**基础样式**：`rounded-full border px-2 py-0.5 text-xs font-medium`

**状态 → 徽章映射表**：

| 数据状态 | Badge 变体 | 示例 |
|---------|-----------|------|
| 项目 active | `outline` + `cn('border-green-500/30 bg-green-500/10 text-green-600')` | `active` |
| 项目 draft | `outline` + `cn('border-amber-500/30 ...')` | `draft` |
| 项目 paused | `outline` + `cn('border-gray-500/30 ...')` | `paused` |
| 节点已提交 | `commit` | `committed` |
| 节点草稿 | `pending` | `pending` |
| 分支名称 | `branch` 或 `branch-subtle` | `feature/v4` |
| Leaf 类型 | `outline` + `text-muted-foreground` | `deploy_agent` |
| Assertion PASS | inline `bg-green-200 text-green-800 rounded` | `PASS` |
| Assertion FAIL | inline `bg-red-200 text-red-800 rounded` | `FAIL` |

> **升级提案：统一 StatusBadge**
>
> 当前 `page.tsx` 中项目状态 Badge 使用 ad-hoc `cn()` 条件类（3 处重复）。
> 建议在 Badge 中新增 `active-subtle`、`draft-subtle`、`paused-subtle` 变体，
> 或创建 `StatusBadge` 复合组件消除重复。

### 3.3 卡片组合

**来源**：`components/ui/card.tsx`

6 个子组件：`Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardAction` / `CardContent` / `CardFooter`

**基础样式**：
```
Card:            bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm
CardHeader:      grid auto-rows-min gap-2 px-6
CardTitle:       leading-none font-semibold
CardDescription: text-muted-foreground text-sm
CardContent:     px-6
CardFooter:      flex items-center px-6
```

#### 4 种组合模式

**模式 A：项目卡片（列表项）**
```tsx
<Card className="transition-colors hover:border-primary/50">
  <CardContent className="flex items-center gap-4 p-4">
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-foreground truncate">{name}</h3>
      <p className="text-sm text-muted-foreground truncate">{desc}</p>
    </div>
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <!-- 统计指标 + Badge -->
    </div>
    <AnimatedButton variant="ghost" size="icon-sm">
      <Trash2 />
    </AnimatedButton>
  </CardContent>
</Card>
```

**模式 B：语义卡片（网格项）**
```tsx
<Card>
  <CardHeader>
    <CardTitle>{title}</CardTitle>
    <CardDescription>{summary}</CardDescription>
  </CardHeader>
  <CardContent>
    <!-- 标签列表、统计数字 -->
  </CardContent>
</Card>
```

**模式 C：时间线条目**
```tsx
<div className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
  <Badge variant="outline" className={stageColor}>{stage}</Badge>
  <div className="min-w-0 flex-1 space-y-0.5">
    <p className="font-medium leading-tight">{label}</p>
    <p className="text-sm text-muted-foreground line-clamp-1">{detail}</p>
  </div>
  <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
</div>
```

**模式 D：信息卡片（Section 容器）**
```tsx
<section className="rounded-lg border bg-card">
  <div className="flex items-center justify-between border-b p-4">
    <h2 className="font-semibold">{title}</h2>
    <span className="text-sm text-muted-foreground">{meta}</span>
  </div>
  <div className="p-4">
    {/* 内容 */}
  </div>
</section>
```

### 3.4 空状态

**来源**：`components/ui/empty-state.tsx`

#### EmptyState（全尺寸）

```tsx
<EmptyState
  icon={MessageSquare}            // lucide-react 图标
  title="No conversations yet"     // 什么是空的
  description="Start a new..."     // 为什么重要 + 该做什么
  action={{ label: "New", onClick }}  // 主操作
  secondaryAction={{ label: "Learn More", onClick }}  // 可选次要操作
  helpLink={{ label: "Documentation", href: "..." }}   // 可选外部链接
/>
```

**布局**：`flex flex-col items-center justify-center py-12 px-4 text-center`

| 元素 | 样式 |
|------|------|
| 图标容器 | `h-14 w-14 rounded-xl bg-gradient-to-br from-muted to-muted/50 ring-1 ring-border/50` |
| 图标 | `h-7 w-7 text-muted-foreground` |
| 标题 | `mb-2 text-lg font-semibold text-foreground` |
| 描述 | `mb-6 max-w-sm text-sm text-muted-foreground` |
| 操作区 | `flex items-center gap-3` |

#### EmptyStateInline（紧凑）

```tsx
<EmptyStateInline
  icon={Info}
  message="No constraints defined"
  action={{ label: "Add", onClick }}
/>
```

**布局**：`flex items-center justify-center gap-3 py-6 px-4 text-muted-foreground`

**三要素规则**（参见 `frontend-design-principles.md` 规则 4）：
1. **什么**：空了什么（标题）
2. **为什么**：为什么重要（描述）
3. **行动**：下一步操作（按钮）

### 3.5 加载状态

**来源**：`components/ui/skeleton.tsx`

#### 7 个变体

| 组件 | 样式 | 用途 |
|------|------|------|
| `Skeleton` | `animate-pulse rounded-md bg-muted` | 基础占位块 |
| `SkeletonShimmer` | Skeleton + `shimmer` 伪元素渐变动画 | 高端占位（premium feel） |
| `SkeletonText` | 多行 Skeleton，末行 `w-3/4` | 文字段落占位 |
| `SkeletonCircle` | `rounded-full` + size (sm/md/lg → 6/10/14) | 头像/图标占位 |
| `SkeletonCard` | 卡片容器 + Circle + Text 组合 | 卡片内容占位 |
| `SkeletonProject` | 项目列表项形状 | 项目列表加载 |
| `SkeletonNode` | `w-72 rounded-2xl border-2` Canvas 节点形状 | Canvas 节点加载 |

**选择指南**：

```
加载整个页面？          → LoadingSpinner（居中 Loader2 图标 + 文案）
加载列表？              → Stagger + SkeletonProject × 3
加载卡片网格？          → SkeletonCard × N
加载文字段落？          → SkeletonText lines={3}
加载头像/图标？         → SkeletonCircle size="md"
Canvas 节点加载？       → SkeletonNode
需要更精致的加载感？    → SkeletonShimmer
```

**Stagger 加载模式**（结合 Framer Motion）：
```tsx
<motion.div variants={staggerContainer} initial="initial" animate="animate">
  {[1, 2, 3].map(i => (
    <motion.div key={i} variants={staggerItem}>
      <SkeletonProject />
    </motion.div>
  ))}
</motion.div>
```

### 3.6 对话气泡

**来源**：`components/shared/TurnBubble.tsx`

```tsx
<TurnBubble
  turn={turnData}           // content, role, highlights, created_at
  highlightColor="yellow"   // 'yellow' | 'green' | 'deepGreen' | 'deepRed'
  showTargetRing={true}     // 目标 Turn 显示外环
/>
```

**角色区分**：

| 角色 | 背景色 | 图标容器 | 图标 |
|------|--------|---------|------|
| user | `bg-blue-50 dark:bg-blue-950/30` | `bg-blue-100 text-blue-600` | `<User />` |
| assistant | `bg-muted` | `bg-muted-foreground/20 text-muted-foreground` | `<Bot />` |
| system | `bg-muted` | 同上 | `<Settings />` |
| tool | `bg-muted` | 同上 | `<Terminal />` |

**高亮系统**（支持两种路径）：

- **Path A：多色高亮** — 每个 range 有独立颜色（`coloredHighlights`）
- **Path B：单色高亮** — 所有 range 统一颜色（`highlights` + `highlightColor`）

高亮色值：

| 颜色 | 亮色 | 暗色 |
|------|------|------|
| yellow | `bg-yellow-200` | `bg-yellow-800/50` |
| green | `bg-green-200` | `bg-green-800/50` |
| deepGreen | `bg-green-500 text-white` | 同 |
| deepRed | `bg-red-500 text-white` | 同 |

目标 Turn 外环（`showTargetRing`）：
```
yellow:    ring-2 ring-yellow-400 ring-offset-2
green:     ring-2 ring-green-400 ring-offset-2
deepGreen: ring-2 ring-green-600 ring-offset-2
deepRed:   ring-2 ring-red-600 ring-offset-2
```

### 3.7 Diff 视图

**来源**：`components/diff/DiffStatsBar.tsx`、`DiffDisplayView.tsx`、`merge/WordDiffDisplay.tsx`、`shared/SourceContextView.tsx`

#### DiffStatsBar

统计横条，显示 Diff 结果的 4 类计数：

| 类型 | 颜色（亮色） | 颜色（暗色） |
|------|------------|------------|
| Identical | `bg-muted text-muted-foreground` | 同 |
| Modified | `bg-amber-100 text-amber-700` | `bg-amber-900/30 text-amber-400` |
| Added | `bg-green-100 text-green-700` | `bg-green-900/30 text-green-400` |
| Removed | `bg-red-100 text-red-700` | `bg-red-900/30 text-red-400` |

布局：`flex gap-3 px-6 py-3 bg-muted/30 border-b`，每个 Badge 可点击跳转。

#### DiffDisplayView

两种视图模式：

**Side-by-side（并排）**：

| 状态 | 背景色 | 左边框 |
|------|--------|--------|
| Identical | `bg-slate-50/50` | 无 |
| Modified | `bg-amber-50/50` | `border-l-2 border-amber-300` |
| Removed | `bg-red-50` | `border-l-2 border-red-300` |
| Added | `bg-green-50` | `border-l-2 border-green-300` |

**Unified（统一）**：

| 前缀 | 颜色 |
|------|------|
| `+` | green (added) |
| `−` | red (removed) |
| `~` | amber (modified) |
| ` ` | slate (identical) |

特性：溯源按钮（MapPin 图标，蓝色）、内联展开的上下文面板。

#### WordDiffDisplay

词级 Diff 显示：`font-mono text-sm`

| 状态 | 样式 |
|------|------|
| unchanged | 普通文字 |
| removed | `bg-red-100 text-red-800 line-through px-1 rounded` |
| added | `bg-green-100 text-green-800 px-1 rounded ml-1` |

#### SourceContextView

溯源上下文卡片，两种模式：

| 模式 | 特征 |
|------|------|
| compact | 截断内容（默认 150 字符），"Show more" 展开 |
| expanded | 显示完整内容 |

关键样式：
- 内容区：`text-xs bg-muted/30 rounded px-2 py-1.5`
- Header：`text-[0.65rem] text-muted-foreground` + MessageCircle 图标
- 展开按钮：`text-blue-600 dark:text-blue-400`

### 3.8 表单输入

**标准组合模式**：

```tsx
{/* 文本输入 */}
<input
  type="text"
  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
  placeholder="..."
/>

{/* 下拉选择 */}
<select className="rounded-md border bg-background px-3 py-1.5 text-sm">
  <option value="require">Must Have</option>
  <option value="exclude">Must Not Have</option>
</select>

{/* 多行文本 */}
<textarea
  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
  placeholder="..."
/>

{/* Checkbox（shadcn/ui）*/}
<Checkbox checked={isChecked} onCheckedChange={handler} />

{/* 已有 shadcn/ui 组件 */}
<Input />      {/* 标准输入框 */}
<Switch />     {/* 开关 */}
```

**表单区域模式**（参见 Leaf 详情页 ConstraintSection）：
```tsx
<div className="rounded-md border border-dashed p-3 space-y-3">
  <div className="flex gap-2">
    {/* 输入控件横排 */}
  </div>
  <p className="text-xs text-muted-foreground">
    {/* 帮助文字 */}
  </p>
</div>
```

### 3.9 导航菜单

#### Sidebar

64px 固定宽度窄侧栏，包含：
- 项目列表
- Agent Demo
- Deploy & Eval
- Insights
- 外部链接（Docs / GitHub）

#### Tabs（shadcn/ui）

```tsx
<Tabs defaultValue="ledger">
  <TabsList>
    <TabsTrigger value="ledger">Ledger</TabsTrigger>
    <TabsTrigger value="latest">Latest Commits</TabsTrigger>
  </TabsList>
  <TabsContent value="ledger" className="mt-6">
    {/* 内容 */}
  </TabsContent>
</Tabs>
```

#### DropdownMenu

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      <Download /> Export
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={handler}>
      <Copy className="mr-2 h-4 w-4" /> Copy Output
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

#### CommandPalette（Cmd+K）

已实现，基于 cmdk。全局注册在 ClientLayout 中。

**场景选择指南**：

```
全局导航？              → Sidebar（始终可见）
同页面切换视角？        → Tabs
操作菜单（少于 5 项）？ → DropdownMenu
操作菜单 + 嵌套？      → DropdownMenu 多级
搜索 + 快捷操作？       → CommandPalette (Cmd+K)
确认危险操作？          → AlertDialog
表单输入弹窗？          → Dialog
详情查看？              → 详情页跳转（router.push）
```

> **升级提案：CollapsibleSection 标准组件**
>
> 三层模型中 Layer 2 大量使用折叠区域模式，但目前只是代码模式（重复的 `useState` + `ChevronDown` 旋转），
> 没有复用组件。建议新建 `CollapsibleSection`：
> ```tsx
> <CollapsibleSection title="Source Context" defaultOpen={false} badge="3 items">
>   {children}
> </CollapsibleSection>
> ```
> 统一折叠动画、展开状态持久化、Badge 计数显示。

> **升级提案：IconText 原子组件**
>
> 代码库中 50+ 处使用 `<span className="flex items-center gap-1">` + lucide 图标 + 文字。
> 建议新建 `IconText` 原子组件减少重复：
> ```tsx
> <IconText icon={GitCommitHorizontal} size="sm">{count}</IconText>
> ```

> **升级提案：ProgressBar 组件**
>
> Merge 进度（"5 of 12 resolved"）、生成进度目前只有文字指示。
> 建议新建 `ProgressBar`，视觉化进度比例：
> ```tsx
> <ProgressBar value={5} max={12} label="5 of 12 resolved" color="blue" />
> ```

---

## 4. 组件画廊设计指南

> 本章节为**未来建设**的组件画廊（Component Gallery）提供设计规格。

### 4.1 页面架构

**路由**：`/gallery`

**布局**：列表页模式（参见 2.2），左侧筛选 + 右侧卡片网格。

```
┌────────────────────────────────────────────────────┐
│ p-6                                                │
│  header: h1 "Component Gallery" + 搜索框           │
│                                                    │
│  ┌──────────┬─────────────────────────────────┐    │
│  │ 侧栏筛选  │  grid gap-6 lg:grid-cols-2      │    │
│  │          │                                 │    │
│  │ 基础      │  ┌───────────┐ ┌───────────┐  │    │
│  │ 按钮      │  │ 组件卡片 1 │ │ 组件卡片 2 │  │    │
│  │ 数据展示  │  └───────────┘ └───────────┘  │    │
│  │ 反馈      │  ┌───────────┐ ┌───────────┐  │    │
│  │ 表单      │  │ 组件卡片 3 │ │ 组件卡片 4 │  │    │
│  │ 导航      │  └───────────┘ └───────────┘  │    │
│  │ 覆盖层    │                                 │    │
│  │ 画布      │                                 │    │
│  │ 语义      │                                 │    │
│  └──────────┴─────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

### 4.2 分类体系

| 分类 | 包含组件 | 图标 |
|------|---------|------|
| **基础** | Skeleton, Typography samples, Color swatches | `Square` |
| **按钮** | Button (11 variants), AnimatedButton, PulseButton, ShimmerButton | `MousePointer` |
| **数据展示** | Badge (14 variants), Card (4 patterns), TurnBubble, SemanticCard | `LayoutGrid` |
| **反馈** | EmptyState, EmptyStateInline, Toast, AlertDialog, ErrorBoundary | `AlertCircle` |
| **表单** | Input, Select, Textarea, Checkbox, Switch | `FormInput` |
| **导航** | Sidebar, Tabs, DropdownMenu, CommandPalette, Tooltip | `Navigation` |
| **覆盖层** | Dialog, Popover, Sheet, DropdownMenu | `Layers` |
| **画布** | Canvas 节点（5 类型 × 3 状态）, Handle, Edge, Minimap, ZoomSlider | `Workflow` |
| **语义** | DiffStatsBar, DiffDisplayView, WordDiffDisplay, SourceContextView, ConstraintItem | `GitCompare` |

### 4.3 展示卡片规格

每个组件的展示卡片包含 5 个区域：

```
┌──────────────────────────────────────┐
│ Header                               │
│  组件名称           [源码链接 →]      │
├──────────────────────────────────────┤
│ Preview                              │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  组件实时预览                 │    │
│  │  (带交互)                    │    │
│  └──────────────────────────────┘    │
│                                      │
├──────────────────────────────────────┤
│ Controls                             │
│  [Variant ▼] [Size ▼] [Theme ☀/🌙]  │
├──────────────────────────────────────┤
│ Code                                 │
│  ```tsx                              │
│  <Button variant="commit" size="sm"> │
│    Commit                            │
│  </Button>                           │
│  ```                     [Copy 📋]   │
├──────────────────────────────────────┤
│ Props Table                          │
│  variant  | string | "default"       │
│  size     | string | "default"       │
│  disabled | bool   | false           │
└──────────────────────────────────────┘
```

### 4.4 交互式预览

| 功能 | 实现方式 |
|------|---------|
| 主题切换 | 预览区独立 `.dark` 类切换 |
| 变体选择 | 下拉菜单，改变预览组件 props |
| 复制代码 | 一键复制当前配置的 JSX 代码 |
| 响应式预览 | 预览区可调宽度（mobile/tablet/desktop） |

### 4.5 实施路径

| 阶段 | 范围 | 依赖 |
|------|------|------|
| **Phase 1** | 静态展示：每个组件一个卡片，固定预览 + 代码片段 | 无 |
| **Phase 2** | 交互切换：Variant/Size 选择器实时更新预览 | Phase 1 |
| **Phase 3** | 搜索筛选：全文搜索 + 分类过滤 + URL 参数持久化 | Phase 2 |
| **Phase 4** | Props 自动生成：从 TypeScript 类型定义自动提取 Props 表 | Phase 3 + 工具链 |

---

## 附录：文件索引

| 文件 | 用途 | 本文引用章节 |
|------|------|-------------|
| `apps/web/src/app/globals.css` | CSS Token（色彩、排版、间距、阴影、Canvas、动画） | 1.1-1.7 |
| `apps/web/src/lib/theme.ts` | TypeScript 设计 Token（品牌、语义、排版、阴影、Canvas） | 1.1, 1.5, 1.7 |
| `apps/web/src/lib/motion.ts` | Framer Motion 动画系统（variants、springs、stagger） | 1.6 |
| `apps/web/src/components/ui/button.tsx` | 按钮系统（11 变体 + 3 动画风味） | 3.1 |
| `apps/web/src/components/ui/badge.tsx` | 徽章系统（14 语义变体） | 3.2 |
| `apps/web/src/components/ui/card.tsx` | 卡片组合系统（6 子组件） | 3.3 |
| `apps/web/src/components/ui/empty-state.tsx` | 空状态组件（2 变体） | 3.4 |
| `apps/web/src/components/ui/skeleton.tsx` | 加载骨架组件（7 变体） | 3.5 |
| `apps/web/src/components/ui/shimmer-button.tsx` | 微光按钮 | 3.1 |
| `apps/web/src/components/shared/TurnBubble.tsx` | 对话气泡组件 | 3.6 |
| `apps/web/src/components/shared/SourceContextView.tsx` | 溯源上下文组件 | 3.7 |
| `apps/web/src/components/diff/DiffStatsBar.tsx` | Diff 统计条 | 3.7 |
| `apps/web/src/components/diff/DiffDisplayView.tsx` | Diff 显示视图 | 3.7 |
| `apps/web/src/components/merge/WordDiffDisplay.tsx` | 词级 Diff 显示 | 3.7 |
| `apps/web/src/app/ClientLayout.tsx` | App Shell 布局 | 2.1 |
| `apps/web/src/app/page.tsx` | 列表页模板 | 2.2 |
| `apps/web/src/app/project/[projectId]/page.tsx` | Canvas 全屏模板 | 2.3 |
| `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` | 详情页模板 | 2.4 |
| `apps/web/src/app/project/[projectId]/merge/[mergeId]/page.tsx` | 全屏工作台模板 | 2.5 |
| `apps/web/src/app/insights/page.tsx` | 响应式网格模板 | 2.6 |
