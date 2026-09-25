# Supabase Integration & Database Architecture

This directory manages the Supabase database migrations, local configuration, and seed data for the **Field Workforce & Operations Management Platform**.

## Migration Source of Truth

Database structure and Row Level Security (RLS) policies are managed through version-controlled SQL migrations located in `./migrations`.

## Development Commands

```bash
# Login to Supabase CLI (Cloud workflow)
pnpm supabase login

# Link repository to a remote Supabase Cloud project
pnpm supabase link --project-ref <your-project-ref>

# Push local migrations to remote database
pnpm supabase db push

# Generate TypeScript types from database schema
pnpm supabase gen types typescript --project-id <your-project-id> > packages/types/src/database.ts

# Generate types locally (if using Docker Supabase)
pnpm supabase gen types typescript --local > packages/types/src/database.ts
```

## Schema Overview

- **`auth.users`**: Supabase Auth user accounts (managed by Supabase Auth).
- **`public.profiles`**: User profile information linked 1:1 with `auth.users(id)`.
- **`public.organizations`**: Multi-tenant organizations.
- **`public.organization_memberships`**: Scoped user membership mapping `auth.users(id)` to `organizations(id)` with roles (`super_admin`, `business_admin`, `manager`, `employee`).
- **`storage.buckets`**: Private object storage bucket (`platform-files`) with RLS policies restricting file access to organization members.

## Phase 1 database regression checks

```bash
python3 supabase/tests/phase1_database.py
```

This creates and destroys an isolated PostgreSQL cluster under the system temporary
directory. It applies every committed migration and tests actual database constraints,
triggers, transactions, concurrent draft inserts, and RLS using a non-superuser,
non-BYPASSRLS `authenticated` role. It requires `psql`, PostgreSQL server binaries
(set `PHASE1_PG_BIN` if they are not under `/usr/lib/postgresql/18/bin`), and permission
to open a local Unix socket. It never connects to the configured remote project.

The harness supplies minimal `auth.users`, `auth.uid()` and storage scaffolding.
Consequently this is real PostgreSQL RLS integration coverage, but it is **not**
Supabase Auth/JWT, PostgREST, or hosted-project verification. The local version used
for hardening was PostgreSQL 18; `config.toml` targets Supabase PostgreSQL 15.

The hardening migration removes the legacy three-argument publish overload and
uses an authenticated, RLS-enforcing two-argument RPC. Published and archived
snapshots protect every column except `change_note`; a published snapshot may
also move once to `archived`. Publication metadata is set from `auth.uid()` and
database time, including for direct status updates. Application publish validation
and authorization remain required; the SQL RPC does not run TypeScript semantic
validation and must not be presented as a substitute for the application service.
