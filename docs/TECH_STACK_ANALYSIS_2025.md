# T3X Tech Stack Analysis - 2025 Paradigm

> Comprehensive comparison of T3X architecture with modern open source projects

## Top Projects Comparison

| Project | Stars | Frontend | Backend/API | Database | ORM | Monorepo | API Style |
|---------|-------|----------|-------------|----------|-----|----------|-----------|
| **Cal.com** | 35k+ | Next.js + React | Next.js API + tRPC | PostgreSQL | Prisma | Turborepo | tRPC |
| **Twenty CRM** | 24k+ | React + Recoil | NestJS + GraphQL | PostgreSQL + Redis | TypeORM | Nx | GraphQL + REST |
| **Infisical** | 20k+ | Next.js + React | Express/NestJS | PostgreSQL + Redis | Custom | pnpm workspaces | REST |
| **Dub.co** | 20k+ | Next.js | Next.js API routes | PostgreSQL | Prisma | Turborepo | REST |
| **Documenso** | 10k+ | Next.js | Next.js + tRPC | PostgreSQL | Prisma | Turborepo | tRPC |
| **next-forge** | Template | Next.js | Separate API app | PostgreSQL | Prisma | Turborepo | REST |

---

## Key 2025 Paradigm Patterns

### 1. Monorepo Tool: Turborepo (Dominant)

```
✅ Turborepo - Used by Cal.com, Dub.co, Documenso, next-forge
✅ Nx - Used by Twenty CRM (more complex, enterprise-grade)
⚠️ pnpm workspaces only - Used by Infisical (simpler but manual)
❌ npm workspaces - Outdated (T3X current)
```

**T3X Gap**: Using npm workspaces without Turborepo. Missing:
- Parallel task execution
- Remote caching (huge CI speedup)
- Task pipelines (`build` waits for deps to build first)

### 2. ORM: Prisma vs Drizzle

| Factor | Prisma | Drizzle | T3X (Drizzle) |
|--------|--------|---------|---------------|
| **Popularity** | Industry standard | Rising fast | ✅ Good choice |
| **Performance** | Good | Better (serverless) | ✅ |
| **Type checking** | 72% faster | Slower | ⚠️ |
| **Bundle size** | ~200kb | ~7.4kb | ✅ |
| **Schema** | Separate `.prisma` file | TypeScript code | ✅ Simpler |
| **Migrations** | `prisma migrate` | `drizzle-kit` | ✅ |

**Verdict**: Drizzle is a modern choice - T3X is ahead of the curve here.

### 3. API Style: tRPC vs REST

| When to use | tRPC | REST |
|-------------|------|------|
| **TypeScript monorepo** | ✅ Best | Good |
| **Full-stack single team** | ✅ Best | Good |
| **Public API / CLI** | ❌ Avoid | ✅ Best |
| **Multiple languages** | ❌ Avoid | ✅ Best |
| **Third-party integrations** | ❌ Avoid | ✅ Best |
| **OpenAPI spec needed** | ⚠️ Possible | ✅ Native |

**T3X Decision**: Need CLI support + external integrations (n8n) → REST is correct choice

### 4. Standalone API vs Embedded

| Project | API Architecture |
|---------|------------------|
| Cal.com | tRPC embedded in Next.js |
| Twenty CRM | **NestJS standalone** (port 3000 backend, 3001 frontend) |
| Infisical | **Express standalone** |
| Dub.co | Next.js API routes (embedded) |
| next-forge | **Separate `apps/api`** (recommended pattern) |

**2025 Trend**: Projects are splitting API into `apps/api` for:
- Independent scaling
- CLI/external tool access
- Better testing
- Clearer separation

---

## T3X Current State Assessment

### ✅ Keep (Already Good)

| What | Why |
|------|-----|
| **Drizzle ORM** | Modern, lightweight, great for PGLite/edge |
| **PostgreSQL** | Industry standard |
| **Next.js 15** | Latest, App Router |
| **React 19** | Latest |
| **TypeScript** | Universal |
| **Vitest** | Fast, modern testing |

### ⚠️ Add/Upgrade

| What | Current | Recommended | Priority |
|------|---------|-------------|----------|
| **Monorepo tool** | npm workspaces | **Turborepo + pnpm** | High |
| **API layer** | Embedded in Next.js | **Standalone `apps/api`** | High |
| **API framework** | Next.js routes | **Hono** | High |
| **Folder structure** | Flat `t3x-*` | **`apps/` + `packages/`** | Medium |
| **Linting** | ESLint + Prettier | **Biome** (10x faster) | Low |
| **Shared types** | None | **`packages/types`** | Medium |

---

## Recommended Stack for T3X 2025

### Proposed Structure

```
t3x/
├── apps/
│   ├── api/              # Hono (REST + OpenAPI)
│   ├── web/              # Next.js 15 (UI only)
│   ├── cli/              # Commander.js
│   └── runner/           # Express (existing)
├── packages/
│   ├── core/             # Semantic engines (existing)
│   ├── storage/          # Drizzle + PGLite (existing)
│   ├── types/            # Shared TypeScript types
│   ├── api-client/       # Generated from OpenAPI
│   └── config/           # Shared ESLint/TS configs
├── turbo.json
├── biome.json            # Replace ESLint + Prettier
├── pnpm-workspace.yaml
└── package.json
```

### Tech Stack Summary

| Layer | Technology | Why |
|-------|------------|-----|
| **Monorepo** | Turborepo + pnpm | Industry standard, caching, parallel |
| **Frontend** | Next.js 15 + React 19 | Already using, keep |
| **API** | Hono + Zod OpenAPI | Fast, OpenAPI auto-gen, edge-ready |
| **Database** | PostgreSQL + PGLite | Already using, keep |
| **ORM** | Drizzle | Already using, great choice |
| **Validation** | Zod | Standard, works with tRPC/Hono |
| **Linting** | Biome | 10x faster than ESLint |
| **Testing** | Vitest | Already using, keep |

---

## Why Hono for API

| Factor | Hono | Express | Fastify | Next.js API |
|--------|------|---------|---------|-------------|
| **Performance** | Fastest | Slow | Fast | Medium |
| **Bundle size** | 14kb | 200kb+ | 100kb+ | N/A |
| **TypeScript** | Native | Weak | Good | Good |
| **Edge deploy** | ✅ Cloudflare/Vercel | ❌ | ❌ | ✅ |
| **OpenAPI** | Built-in | Plugin | Plugin | Manual |
| **Zod validation** | Built-in | Plugin | Plugin | Manual |

---

## Migration Roadmap

### Phase 1: Turborepo + pnpm (1 day)

```bash
# Convert to pnpm
rm -rf node_modules package-lock.json
npm install -g pnpm
pnpm import  # Convert package-lock to pnpm-lock
pnpm install

# Add Turborepo
pnpm add turbo -D -w
# Create turbo.json with build/test/lint pipelines
```

### Phase 2: Restructure folders (1 day)

```
t3x-core → packages/core
t3x-storage → packages/storage
t3x-webui → apps/web
t3x-runner → apps/runner
```

### Phase 3: Extract `apps/api` (2-3 days)

- Create Hono server with Zod OpenAPI
- Move routes from `apps/web/src/app/api/v1/*`
- Generate OpenAPI spec
- Update `apps/web` to call API via HTTP

### Phase 4: Add CLI (Later)

- Create `apps/cli` using Commander.js
- Import `@t3x/api-client` (generated from OpenAPI)

---

## Architecture Diagram

### Current (T3X)

```
┌─────────────────────────────────────────────────────────┐
│                  t3x-webui (Next.js)                    │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │   React UI  │──▶│  API Routes  │──▶│  @t3x/core  │  │
│  │  (Browser)  │   │ /api/v1/*    │   │ @t3x/storage│  │
│  └─────────────┘   └──────────────┘   └──────┬──────┘  │
│                                              │         │
│                                        ┌─────▼─────┐   │
│                                        │  PGLite   │   │
│                                        └───────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Proposed (Modern)

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ apps/cli │  │ apps/web │  │  n8n     │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └──────┬──────┴─────────────┘
            │ HTTP (REST + OpenAPI)
     ┌──────▼──────┐
     │  apps/api   │  ← Hono server (port 8000)
     └──────┬──────┘
            │ Direct imports
   ┌────────┼────────┐
   │        │        │
┌──▼──┐  ┌──▼───┐  ┌─▼────┐
│core │  │storage│  │types │  (packages/)
└─────┘  └──────┘  └──────┘
```

---

## Key References

| Resource | Link |
|----------|------|
| next-forge (Vercel's template) | https://github.com/vercel/next-forge |
| Cal.com monorepo guide | https://handbook.cal.com/engineering/codebase/monorepo-turborepo |
| Twenty CRM | https://github.com/twentyhq/twenty |
| Dub.co | https://github.com/dubinc/dub |
| Infisical | https://github.com/Infisical/infisical |
| Documenso | https://github.com/documenso/documenso |
| Drizzle benchmarks | https://orm.drizzle.team/benchmarks |
| Hono | https://hono.dev |
| Turborepo | https://turborepo.com |
| Biome | https://biomejs.dev |

---

## Verdict

**T3X current stack is 70% modern.** Key gaps:

1. **No Turborepo** → Slow builds, no caching
2. **No standalone API** → Can't build CLI, limits integrations
3. **Flat structure** → Harder to understand

**Drizzle is a great choice** - T3X is ahead of Cal.com/Dub.co on this.

---

*Generated: 2024-12-24*
