# Field Workforce & Operations Management Platform

Production-grade multi-tenant platform for field-service and operational businesses in Nigeria, the UK, and global markets.

## Architecture

- **Frontend:** Next.js (App Router), React, TypeScript, TailwindCSS, PWA-first architecture.
- **Backend & Data Layer:** Supabase Platform (PostgreSQL + Auth + Storage + Row Level Security).
- **Database:** PostgreSQL (Multi-tenant schema with strict `organization_id` scoping and RLS policies).
- **Storage:** Supabase Storage (`platform-files` private bucket with RLS policies).
- **Module Architecture:** Form Builder is an integrated module inside the platform shell.

## Directory Structure

```text
field-workforce-platform/
├── apps/
│   └── web/                   # Next.js App Router Web Platform
├── supabase/                  # Supabase migrations, seed.sql, config.toml & CLI docs
├── packages/
│   ├── ui/                    # Shared React enterprise design system primitives
│   ├── types/                 # Shared TypeScript domain types & DB schemas
│   ├── config/                # Shared configurations
│   └── form-engine/           # Form Builder engine (placeholder until Phase 1)
├── docs/
│   ├── form-builder/          # Approved Form Builder specifications
│   └── architecture/          # Platform architecture docs
└── infra/
    └── docker/                # Optional Docker compose for local PostgreSQL
```

## Setup & Running

### Prerequisites
- Node.js `22.x` (see `.nvmrc`)
- pnpm `9.x` or higher
- Supabase Project credentials or local Supabase CLI

### Installation
```bash
pnpm install
```

### Start Web Application
```bash
pnpm dev
# or
pnpm dev:web
```

### Quality Assurance Commands
```bash
pnpm build        # Production build of all workspace packages
pnpm lint         # Run ESLint across workspace
pnpm typecheck    # Strict TypeScript type check
pnpm test         # Run unit and smoke tests
```
