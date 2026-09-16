# Variant 与 Codex 界面复刻提示词

## 使用原则

- Variant 负责生成和修正视觉稿。
- Codex 负责基于现有源码实现界面并反复校准。
- Variant 每次只上传一张裁剪后的目标界面，不要上传包含目标图、生成结果和聊天区的拼图。
- 首次生成使用“根据截图生成”；已有结果需要修正时使用“纠偏提示词”，不要只使用 `Vary subtle`。
- Codex 应同时获得目标截图和源码，并被明确要求运行页面、截图比较和继续修正。

## Variant：根据截图首次生成

```text
Use the attached cropped screenshot as the only visual target.

Recreate this interface as one desktop design. Match the reference's canvas ratio, overall scale, layout, panel proportions, spacing, alignment, information density, typography, colors, borders, corner radii, shadows, buttons, tabs, inputs, icons, and visible states.

Preserve all visible content and hierarchy. Use one consistent thin-outline icon family and match each icon's meaning, size, stroke weight, color, container, and alignment.

If an illustration or special asset cannot be reproduced, preserve its exact space and surrounding layout without showing placeholder text.

Do not redesign, simplify, add features, change the content, or create alternative layouts. Prioritize visual fidelity over creativity. Generate one desktop design only.
```

## Variant：对已有结果进行纠偏

```text
Use the attached reference as the visual source of truth and the current design as the base.

Make a surgical visual correction only. Keep all content, functionality, hierarchy, and major component positions unchanged.

Correct the differences in this order:
1. Overall scale and canvas proportions
2. Panel widths and layout geometry
3. Spacing, alignment, and information density
4. Typography, row heights, and control sizes
5. Borders, backgrounds, status colors, and shadows
6. Icon shape, size, stroke weight, color, and placement

The current result is too sparse and undersized. Enlarge the interface content, reduce excessive whitespace, and restore the reference's compact density and visual hierarchy.

Do not redesign, generate illustrations, replace content, remove sections, use generic placeholders, or create another direction. Produce one corrected desktop design only.
```

## Codex：根据截图修改现有源码

```text
请以我提供的目标截图作为视觉标准，以当前源码作为功能和数据标准，直接修改现有项目完成复刻。

保持现有路由、数据、业务逻辑、交互和组件职责不变，精确还原截图中的整体比例、布局结构、面板宽度、间距、对齐、信息密度、字体、字号、字重、行高、颜色、边框、圆角、阴影、按钮、标签、输入框、表格、状态以及图标。

优先复用项目现有组件、设计变量、图标库和真实资源。不要使用 Emoji、文本符号、临时占位图、手绘 SVG 或近似图标。缺少特殊图片时先保留准确的尺寸和位置，不要让布局塌陷，也不要显示“Placeholder”文字。

不要自由发挥、重新设计、添加功能、修改文案或删除信息。先检查相关组件和样式，再直接实现，不要只给方案。

完成后在与目标截图相同的视口和页面状态下运行页面，将实现截图与目标图并排比较，继续修正尺寸、比例、间距、字体和图标差异。没有经过实际截图比较，不要声称已经 1:1 复刻。
```

## Codex：根据参考源码复刻到当前项目

```text
请先完整检查参考源码中与该页面相关的组件、样式、设计变量、字体、图标、资源和响应式规则，然后在当前项目中复刻相同界面。

参考源码是视觉标准，当前项目是功能和工程边界标准。保留当前项目的路由、接口、数据流、状态管理和业务行为，只迁移实现该视觉效果所必需的布局、组件样式、图标、字体和资源。

精确匹配页面尺寸、区域比例、间距、对齐、字体层级、颜色、边框、圆角、阴影、控件状态和响应式表现。优先复用参考源码中的真实数值、变量和资源，不要凭感觉重新设计，也不要用近似组件替代。

请直接完成代码修改并运行验证。在相同视口下比较参考页面和当前实现，逐轮修正明显差异，同时保持改动范围集中，不要重构无关代码。
```
