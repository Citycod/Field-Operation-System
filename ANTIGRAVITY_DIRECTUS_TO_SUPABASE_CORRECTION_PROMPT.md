# Antigravity Correction Prompt
## Migrate Field Workforce & Operations Management Platform Foundation from Directus to Supabase

You are correcting the existing foundation of the **Field Workforce & Operations Management Platform**.

The current repository was initially set up with **Directus + PostgreSQL**, but that backend choice is being changed **before Form Builder Phase 1 begins**.

The new agreed backend foundation is:

```text
Next.js + React + TypeScript
        ↓
Supabase
├── PostgreSQL
├── Auth
├── Storage
└── Realtime where useful later
```

The **Form Builder remains one reusable module inside the wider Field Workforce & Operations Management Platform**.

Do not change the product requirements, Form Builder scope, UI/UX specification, schema design direction, implementation plan, or approved module architecture except where documentation specifically references Directus as the backend.

This task is a **foundation correction**, not a Form Builder implementation task.

---

# 1. Objective

Replace the current Directus-specific platform foundation with a clean Supabase-based foundation while preserving:

- Next.js
- React
- TypeScript
- App Router
- pnpm monorepo
- shared platform shell
- PWA-first direction
- multi-tenancy
- role/permission foundation
- Form Builder module placeholder
- existing Form Builder documentation
- existing UI package
- shared types/config packages
- existing routes and visual shell where they are already correct
- test/build quality gates

At the end of this task, the project must no longer depend on Directus for:

- authentication
- CRUD/API access
- tenancy
- storage
- platform data access
- user identity
- organisation membership

Supabase becomes the backend platform.

---

# 2. Do Not Start Form Builder Phase 1 Yet

Do not implement:

- Form Schema v1
- Form Renderer
- drag/drop Builder
- Rules Engine
- Calculation Engine
- Workflow runtime
- Submission Engine
- Visitor App
- Templates
- AI
- Offline Sync
- Payments
- Redis queues
- Native mobile app

Only correct the project foundation.

Stop after the Supabase foundation is verified.

---

# 3. Mandatory Stack After Correction

## Frontend

```text
Next.js
React
TypeScript
App Router
PWA-first
```

## Backend Platform

```text
Supabase
```

Use Supabase for:

```text
PostgreSQL
Authentication
Storage
Row Level Security
Database APIs
Realtime only when genuinely needed later
```

## Package Manager

```text
pnpm
```

## Mobile Strategy

```text
PWA first
Native mobile later
```

## Cache / Queues

```text
Redis later
```

Do not introduce Redis now.

---

# 4. Repository Rule

Preserve the existing monorepo structure unless a small change is necessary.

Expected direction:

```text
field-workforce-platform/
├── apps/
│   └── web/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   └── form-engine/
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   └── README.md
│
├── docs/
│   ├── architecture/
│   ├── form-builder/
│   └── setup/
│
├── .env.example
├── .nvmrc
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Remove obsolete Directus-specific infrastructure once the Supabase replacement is complete and verified.

Do not leave two competing backend architectures in the same active codebase.

---

# 5. First Step — Audit Existing Directus Dependencies

Before changing files, inspect the repository and list every Directus dependency/reference.

Search for:

```text
Directus
@directus/sdk
directus/
DIRECTUS_URL
DIRECTUS_PUBLIC_URL
DIRECTUS_KEY
DIRECTUS_SECRET
directus_users
docker-compose directus service
lib/directus
Directus auth
Directus storage configuration
Directus schema snapshot
```

Produce a concise migration map:

```text
CURRENT DIRECTUS PIECE
→
SUPABASE REPLACEMENT
```

Example:

```text
Directus Auth
→ Supabase Auth

directus_users
→ auth.users + public profiles if needed

Directus SDK client
→ @supabase/supabase-js + @supabase/ssr

Directus S3 storage config
→ Supabase Storage

Directus schema snapshot
→ Supabase SQL migrations

Directus permissions
→ PostgreSQL RLS + application permission helpers
```

Do not delete anything until its replacement is implemented.

---

# 6. Supabase Packages

Use the official Supabase libraries.

Install:

```text
@supabase/supabase-js
@supabase/ssr
```

Use the current stable versions compatible with the repository.

Remove:

```text
@directus/sdk
```

after all Directus code is removed.

Do not add unofficial auth wrappers unless there is a clear need.

---

# 7. Supabase Client Architecture

Create a clean Supabase abstraction.

Recommended structure:

```text
apps/web/src/lib/supabase/
├── client.ts
├── server.ts
├── middleware.ts
├── auth.ts
├── types.ts
└── admin.ts
```

Responsibilities:

## `client.ts`

Browser-safe Supabase client.

Uses only:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Never expose the service-role key.

## `server.ts`

Server-side Supabase client using cookies.

Use `@supabase/ssr`.

Must support authenticated Server Components / Server Actions / Route Handlers.

## `middleware.ts`

Refresh/auth session correctly where needed.

Do not implement insecure manual JWT storage.

## `admin.ts`

Server-only administrative client.

May use:

```env
SUPABASE_SERVICE_ROLE_KEY
```

Rules:

- server only
- never imported into client components
- never exposed in `NEXT_PUBLIC_*`
- use only for trusted administrative operations that cannot be performed with the normal user context

---

# 8. Authentication Correction

Replace the current Directus authentication flow with Supabase Auth.

Required authentication capabilities:

```text
sign in
sign out
get current user
session refresh
protected routes
server-side user retrieval
```

Use secure cookie-based SSR integration.

Do not persist raw access/refresh tokens manually in localStorage if the Supabase SSR package can manage the session properly.

Target flow:

```text
User logs in
   ↓
Supabase Auth
   ↓
Secure session cookies
   ↓
Server Components / Actions can resolve user
   ↓
Organisation membership resolved
   ↓
Platform access
```

Keep the existing UI shell/login screen where suitable; replace backend logic only.

---

# 9. User Model

Do not create a second authentication user table.

Supabase Auth owns identity in:

```text
auth.users
```

If the application needs profile data, create:

```text
public.profiles
```

Suggested:

```sql
profiles
--------
id uuid primary key references auth.users(id) on delete cascade
first_name text
last_name text
display_name text
avatar_url text
status text
created_at timestamptz
updated_at timestamptz
```

Only create `profiles` if required by the platform shell/user model.

Do not duplicate passwords, emails, or auth credentials into public tables.

---

# 10. Multi-Tenant Data Model

Multi-tenancy is mandatory.

Create these actual PostgreSQL tables through Supabase migrations:

## `organizations`

Minimum:

```text
id uuid primary key
name text not null
slug text not null unique
status text not null
created_at timestamptz
updated_at timestamptz
```

Recommended statuses:

```text
active
suspended
archived
```

## `organization_memberships`

Minimum:

```text
id uuid primary key
organization_id uuid not null
user_id uuid not null
role_key text not null
status text not null
created_at timestamptz
updated_at timestamptz
```

Foreign keys:

```text
organization_id → organizations.id
user_id → auth.users.id
```

Uniqueness:

```text
unique (organization_id, user_id)
```

Role values initially:

```text
super_admin
business_admin
manager
employee
```

Membership status:

```text
active
invited
disabled
```

Do not create separate tenant databases.

Use shared PostgreSQL with strong tenant scoping + RLS.

---

# 11. Database Migrations

Supabase migrations become the source of truth for database structure.

Create:

```text
supabase/migrations/
```

Use SQL migrations for:

- profiles if needed
- organizations
- organization_memberships
- indexes
- constraints
- helper functions required for RLS
- RLS policies

Do not manually change the production database without migration files.

Every schema change must be reproducible.

---

# 12. Supabase Type Generation

Prepare the project to use generated database types.

Expected pattern:

```text
supabase gen types typescript ...
```

Store generated types in a stable location such as:

```text
packages/types/src/database.ts
```

or:

```text
apps/web/src/lib/supabase/database.types.ts
```

Use generated DB types rather than manually duplicating database schemas wherever possible.

The manually maintained platform domain types may wrap/extend the generated types where useful.

---

# 13. Row Level Security — Critical

Enable RLS on tenant-owned public tables.

At minimum:

```text
organizations
organization_memberships
```

Future tenant-owned tables must also enable RLS.

Do not rely only on frontend checks.

---

# 14. Membership Helper Function

Create a safe database helper where useful, such as:

```sql
is_organization_member(org_id uuid)
```

Conceptual behavior:

```text
auth.uid()
↓
organization_memberships
↓
active membership exists
```

A separate helper may resolve role/capability if useful.

Be careful with `SECURITY DEFINER`.

If used:
- use minimal privileges
- set safe search_path
- do not accidentally create an RLS bypass
- document the function

---

# 15. Base RLS Policies

Implement policies for current tenancy tables.

Example intent:

## Organizations

Authenticated user can read an organization only if:
- they have active membership
OR
- they are a valid platform-level administrator under the chosen platform-admin model

Ordinary users must not update arbitrary organisations.

## Memberships

User can read memberships only according to role requirements.

At minimum:
- a normal member may read their own membership
- Business Admin may read/manage members of their own organisation if approved
- a user must never read arbitrary membership data across unrelated organisations

Do not make broad policies like:

```sql
using (auth.role() = 'authenticated')
```

for tenant-owned data.

---

# 16. Platform Permission Layer

Keep the existing application permission helpers if they are useful, but refactor them to work with Supabase membership data.

Architecture:

```text
RLS
=
database security boundary

Application permission helpers
=
business capability checks
```

We need both.

Future capabilities include:

```text
forms.read
forms.create
forms.edit
forms.publish

submissions.create
submissions.read_own
submissions.read_all

approvals.read_assigned
approvals.decide
```

Do not implement full Form Builder permissions now.

Only establish the pattern.

---

# 17. Active Organization Context

Preserve the existing `TenantSwitcher` if useful.

Refactor its data source to Supabase.

Target:

```text
authenticated user
↓
active organization memberships
↓
organization switcher
↓
selected organization
↓
server verifies membership
↓
tenant-scoped module
```

Do not trust a browser-selected organization ID by itself.

Any server mutation/query using an organization ID must verify membership/RLS.

---

# 18. Tenant Guard Refactor

Replace the Directus-based tenant guard with a Supabase-aware server utility.

Suggested API:

```ts
getCurrentUser()
getUserMemberships()
requireOrganizationMembership(organizationId)
requireOrganizationRole(organizationId, roles)
requirePermission(...)
```

These must operate from the authenticated Supabase session.

Do not accept `userId` from browser input as proof of identity.

Use authenticated `auth.uid()` / server user identity.

---

# 19. Storage Migration

Replace Directus/S3-specific application wiring with Supabase Storage.

Use private buckets by default.

Create or prepare a bucket such as:

```text
platform-files
```

Do not create Form-Builder-only storage.

Shared storage should eventually support:

```text
Form Builder documents
Job documents
HSE evidence
Asset files
Expense attachments
other platform modules
```

Recommended object-path pattern:

```text
{organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}
```

Example:

```text
org-123/forms/submission-456/file-uuid-quotation.pdf
```

The path is organizational structure, not the sole security boundary.

Use Storage RLS/policies.

Downloads for private files should use:
- authenticated access
- signed URLs where appropriate

Do not make the bucket public.

---

# 20. Storage Status for This Task

If no real Supabase project credentials exist yet:

- create migrations/policies/configuration
- document setup
- do not claim upload/download connectivity is verified

If credentials are available:

- create private bucket
- perform one small upload/download/delete smoke test
- report result

Do not fabricate connectivity.

---

# 21. Environment Variables

Remove obsolete Directus environment variables.

The new `.env.example` should include:

```env
# Application
NEXT_PUBLIC_APP_NAME=
NEXT_PUBLIC_APP_URL=

# Supabase browser-safe
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase server-only
SUPABASE_SERVICE_ROLE_KEY=

# Optional tooling
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=
```

Do not expose:

```text
SUPABASE_SERVICE_ROLE_KEY
database password
JWT secrets
```

through `NEXT_PUBLIC_*`.

Document which values are:
- safe for browser
- server-only
- local tooling only

---

# 22. Supabase CLI Foundation

Prepare Supabase CLI project structure.

Create:

```text
supabase/config.toml
supabase/migrations/
supabase/seed.sql
supabase/README.md
```

Useful commands should be documented, such as:

```text
supabase login
supabase link
supabase db push
supabase db reset
supabase migration new
supabase gen types typescript
```

Do not assume Docker-based local Supabase can run if Docker is unavailable on this machine.

Support a cloud-linked development workflow.

If local Supabase requires Docker and Docker is unavailable:
- document it honestly
- use cloud project for actual connectivity when credentials exist
- do not block code architecture on local Docker

---

# 23. Remove Directus Infrastructure

After Supabase replacements are implemented and verified:

Remove active Directus-specific files/configuration such as:

```text
directus/
apps/web/src/lib/directus/
Directus Docker service
Directus env variables
@directus/sdk dependency
Directus schema snapshots
Directus README/setup scripts
```

If historical documentation is useful, move it to:

```text
docs/archive/directus-foundation/
```

rather than leaving it as active architecture.

Do not leave `Directus + Supabase` looking like two supported production backends.

Supabase is the new active backend.

---

# 24. Docker / Infrastructure Cleanup

The existing local Docker stack was created for:

```text
PostgreSQL + Directus
```

This is no longer the main development architecture.

Remove Directus-specific Docker configuration.

Do not maintain a duplicate standalone PostgreSQL container as the application's production source if Supabase is now the active managed database.

A local DB may only remain if clearly documented as:
- optional tooling/testing
- not a competing source of truth

Simplify infrastructure.

---

# 25. Platform Shell

Preserve the existing shared platform shell if it is already good.

Do not redesign it unnecessarily.

It should still support routes such as:

```text
/dashboard
/forms
/submissions
/approvals
/administration
```

The Form Builder remains a placeholder module.

Do not build the 22 Form Builder screens yet.

---

# 26. PWA

Preserve:
- manifest
- installability foundation
- responsive shell

Do not implement offline operational data sync yet.

Do not introduce aggressive service-worker caching for authenticated business data.

---

# 27. Documentation Updates

Update the project documentation so there is no architectural contradiction.

At minimum inspect/update:

```text
AGENTS.md
FORM_BUILDER_MASTER_SPEC.md
docs/architecture/PLATFORM-ARCHITECTURE.md
docs/form-builder/03-DATA-MODEL.md
docs/form-builder/04-API-SERVICE-CONTRACTS.md
docs/form-builder/05-AUTH-TENANCY-PERMISSIONS.md
docs/form-builder/06-IMPLEMENTATION-PLAN.md
docs/form-builder/09-PLATFORM-MODULE-ARCHITECTURE.md
README.md
docs/setup/*
```

Important:

Do not change approved product behavior.

Only update backend implementation wording from Directus assumptions to Supabase architecture.

The platform architecture document should become:

```text
Next.js / React / TypeScript
           ↓
Supabase
├── PostgreSQL
├── Auth
├── Storage
└── RLS
```

Form Builder remains:

```text
Platform Module
    ↓
Custom schema / renderer / builder / workflow logic
    ↓
Supabase persistence/security/storage
```

---

# 28. Form Builder Documentation Rule

Do not remove the generic Form Builder architecture.

The Form Builder still owns:

```text
form schema
renderer
builder
rules
calculations
workflow logic
submission lifecycle
versioning
```

Supabase owns/provides infrastructure:

```text
database
auth
storage
RLS
API/data access
```

Do not make the Form Builder "Supabase-specific" at the domain model level.

Keep domain/services clean enough that the engine logic is not tightly coupled to UI SDK calls.

---

# 29. Data Access Architecture

Do not scatter Supabase queries through arbitrary React components.

Use a service/repository boundary.

Recommended:

```text
apps/web/src/features/
apps/web/src/lib/supabase/

services/
repositories/
server actions / route handlers
```

Example conceptual separation:

```text
React UI
↓
FormService / OrganisationService
↓
Supabase server client
↓
PostgreSQL + RLS
```

Client-side Supabase access may be used where genuinely appropriate, but privileged/business-critical mutations should go through trusted server code where practical.

---

# 30. Security Requirements

Mandatory:

- RLS enabled on tenant tables
- server-side authenticated user resolution
- no service-role key in browser
- no database password in browser
- no arbitrary client-selected tenant trust
- private storage bucket
- storage policies
- membership validation
- safe admin-client separation
- no hardcoded credentials
- no `.env` secrets committed
- clean `.gitignore`

---

# 31. Tests to Add / Update

Update the existing tests so they no longer depend on Directus assumptions.

Add or retain:

## Auth foundation tests

Test abstractions where practical:
- unauthenticated access rejected
- current-user helper behavior

## Tenant security tests

Mandatory cases:

```text
active member allowed
non-member rejected
disabled membership rejected
Org A cannot access Org B tenant data
```

Where possible, add integration tests against Supabase/RLS.

Do not pretend unit mocks prove RLS.

Clearly distinguish:

```text
unit tenant guard tests
vs
real database RLS tests
```

---

# 32. Verification Requirements

Before declaring the migration complete, run:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All must pass.

Also verify no active Directus imports remain:

```bash
grep -R "@directus/sdk" .
grep -R "lib/directus" .
grep -R "DIRECTUS_" .
```

Exclude archived docs if they are intentionally retained.

---

# 33. Supabase Connectivity Verification

If valid Supabase credentials are available, verify:

```text
Supabase API reachable
authentication works
current user can be resolved
organizations can be queried through permitted access
membership can be queried
non-member tenant access is denied
```

If credentials are unavailable, stop and tell me exactly which credentials/project setup I need to provide.

Do not invent a Supabase URL/key.

Do not claim live verification without a real project.

---

# 34. Migration Safety

Before deleting Directus code:

1. ensure Supabase replacement compiles
2. ensure tests pass
3. ensure platform shell still works
4. ensure login flow is replaced
5. ensure tenant context still works

Then remove obsolete Directus pieces.

Do not force-push `main`.

Use a normal commit.

Suggested commit:

```text
refactor(platform): replace Directus foundation with Supabase
```

---

# 35. Required Completion Report

When finished, provide:

## A. Migration Summary

```text
Removed
Replaced
Preserved
Added
```

## B. Repository Tree

Relevant new structure.

## C. Supabase Architecture

Explain:

```text
auth
server/client clients
database
RLS
storage
tenant context
```

## D. Database Tables

List actual tables and constraints:

```text
profiles if created
organizations
organization_memberships
```

## E. RLS Policies

List actual policies and what each permits.

## F. Storage

Report:
- bucket configuration
- privacy
- policies
- whether connectivity was tested

## G. Authentication

Explain:
- login
- logout
- session handling
- current user
- protected route pattern

## H. Environment Variables

List required variable names only.

Do not print secrets.

## I. Directus Removal

Confirm:
- Directus SDK removed
- Directus code removed
- Directus environment variables removed
- Directus service removed
- Directus active documentation references corrected

## J. Quality Results

Provide actual output summary for:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## K. Git Status

Show:

```text
git status
```

## L. Remaining Manual Actions

Tell me if I still need to:
- create Supabase project
- enter keys
- link Supabase CLI
- run migrations
- create storage bucket
- create initial admin user

Do not hide manual dependencies.

---

# 36. Final Acceptance Criteria

This correction is complete only when:

- Directus is no longer an active backend dependency
- Supabase packages are installed
- browser/server Supabase clients exist
- Supabase SSR auth architecture exists
- organizations are represented in SQL migrations
- organization memberships reference `auth.users`
- tenant tables have RLS enabled
- basic membership policies exist
- tenant guard uses authenticated Supabase identity
- platform shell still works
- Form Builder remains a module placeholder
- PWA setup remains intact
- storage foundation uses Supabase Storage
- documentation reflects Supabase architecture
- lint passes
- typecheck passes
- tests pass
- production build passes
- no secrets are committed

Then stop.

Do not start Form Builder Phase 1 automatically.

I will review this migration before Codex begins implementing Form Schema v1.
