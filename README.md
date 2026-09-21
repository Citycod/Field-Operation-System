# Field Workforce & Operations Management Platform

Production-grade multi-tenant platform for field-service and operational businesses in Nigeria, the UK, and global markets.

## Architecture

- **Frontend:** Next.js (App Router), React, TypeScript, TailwindCSS, PWA-first architecture.
- **Backend & Data Layer:** Directus headless API engine.
- **Database:** PostgreSQL (Multi-tenant schema with strict `organization_id` scoping).
- **Storage:** S3-compatible Object Storage (Cloudflare R2 / AWS S3).
- **Module Architecture:** Form Builder is an integrated module inside the platform shell.

## Directory Structure

```text
field-workforce-platform/
├── apps/
│   └── web/                   # Next.js App Router Web Platform
├── directus/                  # Directus extensions, snapshots & schema
├── packages/
│   ├── ui/                    # Shared React enterprise design system primitives
│   ├── types/                 # Shared TypeScript domain types
│   ├── config/                # Shared configurations
│   └── form-engine/           # Form Builder engine (placeholder until Phase 1)
├── docs/
│   ├── form-builder/          # Approved Form Builder specifications
│   └── architecture/          # Platform architecture docs
└── infra/
    └── docker/                # Docker compose for Directus + PostgreSQL
```

## Setup & Running

### Prerequisites
- Node.js `22.x` (see `.nvmrc`)
- pnpm `9.x` or higher
- Docker & Docker Compose (for local database and Directus backend)

### Installation
```bash
pnpm install
```

### Start Local Infrastructure (Directus + Postgres)
```bash
pnpm dev:directus
```

### Start Web Application
```bash
pnpm dev:web
```

### Quality Assurance Commands
```bash
pnpm build        # Production build of all workspace packages
pnpm lint         # Run ESLint across workspace
pnpm typecheck    # Strict TypeScript type check
pnpm test         # Run unit and smoke tests
```
