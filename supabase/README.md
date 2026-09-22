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
