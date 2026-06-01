# T3X Release 操作手册

这份文档是团队日常操作版。英文规则来源是
[`release-flow.md`](release-flow.md) 和
[`pr-and-release-guards.md`](../contributing/pr-and-release-guards.md)。

核心规则：

- 每次进 `main` 都是一次 T3X product release。
- Product release 一定有版本号，例如 `0.4.0`。
- Product release 可以发布零个、一个或多个 package。
- npm package 版本由 Changesets 决定，不要求等于 product release 版本。

## 1. 分支模型

日常开发：

```text
feature/*
  -> PR to dev
  -> merge dev
```

正式发布：

```text
dev
  -> release/0.4.0
  -> PR to main
  -> merge main
```

紧急修复：

```text
hotfix/*
  -> PR to main
  -> merge main
  -> back-merge to dev
```

不要把普通 feature branch 直接 PR 到 `main`。`main` 只接受：

- `release/x.y.z`
- `hotfix/*`
- Changesets 自动开的 version package PR

## 2. Product Release Version

`release/0.4.0` 里的 `0.4.0` 是 T3X 产品 release 版本，不是 npm package
版本。

建议规则：

- 用户可见能力变化：minor，例如 `0.4.0 -> 0.5.0`。
- bugfix、CI/release guard、文档修正、小型内部改动：patch，例如
  `0.4.0 -> 0.4.1`。
- 当前 `0.x` 阶段不强求严格 semver，但每次进 `main` 必须能解释为什么是
  minor 或 patch。

例子：

```text
T3X product release: 0.4.0
Packages:
- None
```

```text
T3X product release: 0.5.0
Packages:
- @t3x-dev/yops 0.3.0
- @t3x-dev/local unchanged
```

## 3. Changeset 什么时候需要

Changeset 只负责 package publish intent。

需要 changeset：

- 改了 `@t3x-dev/local` 的用户可见行为。
- 改了 `@t3x-dev/yops` 的用户可见行为。
- 改了 install、runtime、no-key demo 行为。
- 改了公开文档承诺，并且这个承诺会影响 package 用户。

通常不需要 changeset：

- CI-only。
- release 流程文档。
- contributor-only docs。
- test-only。
- 内部重构且不改变 public package behavior。

注意：不需要 changeset 不代表不需要 product release。只要代码进入 `main`，
就必须出现在某个 product release 里。

## 4. 正常 Release 操作

1. 确认 `dev` 是绿的。
2. 选下一个 T3X product release version。
3. 从 `dev` 开 release branch：

   ```bash
   git fetch origin
   git switch -c release/0.4.0 origin/dev
   git push -u origin release/0.4.0
   ```

4. 开 PR：base 选 `main`，compare 选 `release/0.4.0`。
5. 使用 release PR template。
6. 填 `T3X product release version: \`0.4.0\``。
7. 列 included PRs 或 compare range。
8. 写 `Release Notes`。
9. 填 `Package Releases`：
   - 没有 package publish：写 `- None`。
   - 有 public package 变化：一行一个 package，例如
     `- \`@t3x-dev/local\`: patch`，并确认 `.changeset/*.md` 已经在
     release branch。
10. 等 `PR Validation / Check, build, and test` 通过。
11. merge 到 `main`。

merge 后如果有 changeset，Release workflow 会开 `chore: version packages` PR。
review 这个 version PR，确认 package version 和 changelog 合理，再 merge。

merge 后 Release workflow 也会根据 release PR body 创建 product release 记录：

```text
t3x-v0.4.0
```

这个 GitHub Release 记录的是 T3X product release，不是 npm package release。

## 5. Code-only Release

适用场景：

- CI/release guard 改动。
- 文档或流程改动。
- 内部重构。
- 不影响 public package 用户的修复。

release PR 要写：

```md
T3X product release version: `0.4.1`

## Release Notes

- Tighten release PR policy checks.

## Package Releases

- None
```

这类 release merge 到 `main` 后不会 publish npm package。

CI 会检查 code-only release branch 里不能存在 `.changeset/*.md`。如果存在，
说明这次 release 实际包含 package publish intent，不能写 `Package Releases:
- None`。

## 6. Package Release

适用场景：

- `@t3x-dev/local` 或 `@t3x-dev/yops` 的用户可见行为变化。
- 需要 npm 用户拿到新版本。

步骤：

1. 在功能 PR 或 release branch 里添加 changeset：

   ```bash
   pnpm changeset
   ```

2. release PR 填：

   ```md
   ## Package Releases

   - `@t3x-dev/local`: patch
   ```

3. 确认 `Package Releases` 和 `.changeset/*.md` frontmatter 一致。例如列了
   `@t3x-dev/local`，changeset 里必须有：

   ```md
   ---
   "@t3x-dev/local": patch
   ---
   ```

4. merge release PR 到 `main`。
5. Release workflow 创建 `t3x-vx.y.z` product release 记录，并开
   `chore: version packages` PR。
6. review version PR：
   - package version 是否合理。
   - changelog 是否准确。
   - lockfile/version manifest 是否合理。
7. merge version PR。
8. Release workflow publish package/runtime artifacts。

## 7. 常见错误

- 错误：`release/0.4.0` 意味着所有 package 都要发 `0.4.0`。
  正确：它只代表 T3X product release `0.4.0`。

- 错误：没有 changeset 就可以静默 merge 到 `main`。
  正确：没有 changeset 只代表不发 package；进 `main` 仍然必须有 product
  release version 和 release notes。

- 错误：feature branch 可以直接 PR 到 `main`。
  正确：普通发布必须从 `release/x.y.z` 进 `main`。

- 错误：docs/CI-only 不需要 release。
  正确：可以不发 package，但只要进入 `main`，仍然是一次 product release。
