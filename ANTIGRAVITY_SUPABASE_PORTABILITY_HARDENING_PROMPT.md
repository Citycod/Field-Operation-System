# ANTIGRAVITY PROMPT — SUPABASE PORTABILITY HARDENING

You are working inside the existing repository for the **Field Workforce & Operations Management Platform**.

The project will continue using **Supabase** because it is open source and gives us a fast MVP path with PostgreSQL, Auth, Storage and RLS.

However, the architecture must be designed so that the business is **not tightly locked to Supabase Cloud**.

Target long-term path:

```text
MVP / Early Stage
        ↓
Managed Supabase Cloud
        ↓
Scale and monitor cost
        ↓
If needed later:
- self-host Supabase
OR
- migrate PostgreSQL/Auth/Storage independently
```

This task is NOT to remove Supabase.
This task is to harden the current Supabase foundation for portability, maintainability and future scaling.
Do not begin Form Builder implementation automatically after this task.

---

## 1. Required reading

Before editing, read:

```text
AGENTS.md
FORM_BUILDER_MASTER_SPEC.md
README.md
docs/architecture/PLATFORM-ARCHITECTURE.md
docs/form-builder/00-MVP-SCOPE.md
docs/form-builder/01-UI-UX-SPEC.md
docs/form-builder/02-FORM-SCHEMA-SPEC.md
docs/form-builder/03-DATA-MODEL.md
docs/form-builder/04-API-SERVICE-CONTRACTS.md
docs/form-builder/05-AUTH-TENANCY-PERMISSIONS.md
docs/form-builder/06-IMPLEMENTATION-PLAN.md
docs/form-builder/07-TESTING-ACCEPTANCE.md
docs/form-builder/08-DECISIONS-LOG.md
docs/form-builder/09-PLATFORM-MODULE-ARCHITECTURE.md
```

Also inspect `apps/web/`, `packages/`, `supabase/`, `.env.example`, `package.json`, and `pnpm-workspace.yaml`.

Do not change approved product scope.

---

## 2. Locked stack

Keep:

```text
Next.js
React
TypeScript
App Router
PWA-first
Supabase
  - PostgreSQL
  - Auth
  - Storage
  - RLS
pnpm monorepo
multi-tenant architecture
```

Do not introduce Directus, Firebase, Neon as the active backend, NestJS, Express, or another BaaS unless explicitly instructed later.

---

## 3. Main architecture goal

The application must not depend directly on Supabase everywhere.

Target:

```text
React / Next.js UI
        ↓
Application Services
        ↓
Repository / Infrastructure Interfaces
        ↓
Supabase Adapters
        ↓
Supabase
├── PostgreSQL
├── Auth
├── Storage
└── RLS
```

Business/domain logic must not know unnecessary Supabase implementation details.

---

## 4. Database portability rules

PostgreSQL is the true database foundation.

Use standard PostgreSQL concepts where possible:

```text
tables
foreign keys
constraints
indexes
JSONB
transactions
views
functions only where justified
RLS
```

All schema changes must exist as committed SQL migrations under:

```text
supabase/migrations/
```

The database must be reproducible from migrations.

Avoid undocumented dashboard-only configuration.

---

## 5. Data-access boundary

Audit the repository for direct calls such as:

```ts
supabase.from(...)
```

inside React components, pages, layouts and random utilities.

Business-critical data access should follow:

```text
UI
↓
Service
↓
Repository Interface
↓
Supabase Repository
```

Examples:

```text
OrganizationService
OrganizationRepository
MembershipService
MembershipRepository
```

Do not prematurely build future Form Builder repositories in this task.

Establish the pattern using only the currently implemented foundation.

---

## 6. Authentication abstraction

Supabase Auth remains the current implementation.

Do not scatter:

```ts
supabase.auth.*
```

through unrelated code.

Create or preserve a clear auth boundary, conceptually:

```ts
interface AuthService {
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  getSession(): Promise<AuthSession | null>;
}
```

Current implementation may be `SupabaseAuthService`.

Do not break secure SSR cookie/session handling.
Do not move tokens into localStorage manually.

---

## 7. Storage abstraction

Supabase Storage is used now, but application code should depend on a generic storage interface.

Create something conceptually like:

```ts
export interface StorageService {
  upload(input: UploadFileInput): Promise<StoredFile>;
  remove(path: string): Promise<void>;
  createSignedUrl(path: string, expiresIn: number): Promise<string>;
}
```

Implement:

```text
SupabaseStorageService
```

Do not implement S3/MinIO/R2 adapters yet.

The interface must make those possible later without changing Form Builder business logic.

Use a provider-neutral key strategy:

```text
{organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}
```

Store metadata such as:

```text
storage_key
file_name
mime_type
size
```

Do not treat permanent provider-specific public URLs as the source of truth.

---

## 8. RLS and tenancy

Keep PostgreSQL RLS.

Current tenancy pattern:

```text
auth.uid()
→ organization_memberships
→ organization
→ tenant-owned row
```

Every tenant-owned record must include:

```text
organization_id
```

Security should exist at multiple layers:

```text
RLS
+
server-side authorization
+
tenant-scoped repositories/services
```

Do not trust `organization_id` merely because the UI supplied it.

Preserve tenant isolation tests.

Document that `auth.uid()` is one of the auth-specific areas that would require adaptation if Supabase Auth were replaced later.

---

## 9. Supabase client boundaries

Keep separate:

```text
browser client
server client
admin/service-role client
```

Browser client may use only:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Admin/service-role client:
- server only
- never imported into client components
- only used when required
- must not become the default path for ordinary user operations

Audit service-role usage.

Normal operations should use authenticated user context wherever practical so RLS remains effective.

---

## 10. Avoid unnecessary lock-in

Do not add unnecessary dependencies on:

```text
Edge Functions
Realtime everywhere
Supabase-specific cron
Supabase-specific queues
cloud-only proprietary integrations
```

unless a future requirement genuinely needs them.

Prefer:

```text
Next.js server code
PostgreSQL
standard SQL
standard HTTP
portable interfaces
```

Realtime may be used later where it has clear product value.

---

## 11. Generated database types

Keep generated DB types in the repository.

If the existing location is:

```text
packages/types/src/database.ts
```

preserve it unless there is a strong reason not to.

Generated infrastructure types should not unnecessarily leak into the core Form Engine domain.

---

## 12. Portability documentation

Create:

```text
docs/architecture/SUPABASE-PORTABILITY.md
```

Document:

### Current deployment
```text
Managed Supabase Cloud
```

### Future path A
```text
Self-hosted Supabase
```

### Future path B
```text
PostgreSQL
+ replacement Auth
+ S3-compatible Storage
```

Explain the migration concepts:

Database:
```text
PostgreSQL dump/restore
committed migrations
```

Storage:
```text
separate object transfer
```

Auth:
```text
requires a planned identity migration/replacement
```

Be explicit that database and storage migration are separate.

Do NOT self-host Supabase now.

---

## 13. Documentation updates

Update these documents so there is no ambiguity:

```text
AGENTS.md
README.md
docs/architecture/PLATFORM-ARCHITECTURE.md
docs/form-builder/08-DECISIONS-LOG.md
docs/form-builder/09-PLATFORM-MODULE-ARCHITECTURE.md
```

Add an ADR equivalent to:

```text
Decision:
Use Supabase for MVP and early production.

Constraint:
Business logic must not be tightly coupled to Supabase APIs.

Database:
Standard PostgreSQL is the source of truth.

Auth:
Supabase Auth is accessed through an application auth boundary.

Storage:
Supabase Storage is accessed through a generic storage interface.

Exit paths:
- self-host Supabase
- migrate PostgreSQL and replace auth/storage adapters
```

Do not modify approved Form Builder functionality.

---

## 14. Form Engine isolation

This is critical.

`packages/form-engine` must not directly depend on:

```text
@supabase/supabase-js
@supabase/ssr
```

The Form Engine should eventually contain infrastructure-independent logic such as:

```text
schema
validation
renderer contracts
rules
calculations
versioning logic
```

Future intended path:

```text
Form Builder UI
      ↓
Application Service
      ↓
Form Repository Interface
      ↓
Supabase Form Repository
      ↓
PostgreSQL
```

and:

```text
Document Upload
      ↓
File Service
      ↓
Storage Interface
      ↓
Supabase Storage Adapter
```

---

## 15. Do not over-engineer

This is a portability-hardening task.

Do not:
- redesign the platform shell
- rebuild working authentication without need
- start Form Builder UI
- change tenant model
- change approved roles
- introduce excessive clean-architecture boilerplate
- create interfaces for every trivial helper

Only abstract real external infrastructure boundaries.

---

## 16. Static audit

Before finishing, search for:

```text
supabase.from(
supabase.auth.
supabase.storage.
createClient(
SUPABASE_SERVICE_ROLE_KEY
```

Classify every occurrence.

Allowed locations include:

```text
lib/supabase/
infrastructure/supabase/
repository implementations
auth adapter
storage adapter
integration tests
```

Questionable locations include:

```text
React UI components
domain logic
packages/form-engine
business calculation code
random utilities
```

Refactor questionable usage.

---

## 17. Tests

Preserve all passing tests.

Add focused tests where useful for:

```text
tenant guard
auth abstraction
storage abstraction
repository boundary
```

Do not claim actual cloud portability from unit mocks.

If Supabase integration credentials are available, keep integration tests clearly separated from unit tests.

---

## 18. Environment variables

Ensure `.env.example` separates:

```env
# Browser-safe
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-only
SUPABASE_SERVICE_ROLE_KEY=

# Tooling only
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=
```

No secrets committed.

---

## 19. Git workflow

Use a dedicated branch such as:

```text
refactor/supabase-portability
```

Do not force-push `main`.

Use focused commits.

Suggested:

```text
refactor: introduce supabase infrastructure boundaries
refactor: abstract auth and storage providers
docs: document supabase portability strategy
test: verify infrastructure boundaries
```

---

## 20. Quality gates

Before completion run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All must pass.

Do not suppress errors merely to make checks green.

---

## 21. Completion report

When done, STOP and report:

1. Branch and commits
2. Git status
3. Direct Supabase usages found
4. Which usages were refactored
5. Abstractions added
6. Where Supabase Auth is isolated
7. Where Supabase Storage is isolated
8. Confirmation PostgreSQL remains source of truth
9. Confirmation migrations remain committed
10. Confirmation RLS remains active
11. Confirmation `packages/form-engine` has no Supabase dependency
12. Documentation created/updated
13. Tests added
14. `pnpm lint` result
15. `pnpm typecheck` result
16. `pnpm test` result
17. `pnpm build` result
18. Remaining intentional Supabase-specific coupling
19. Future migration path to self-hosted Supabase or PostgreSQL + alternate Auth/Storage

Then STOP.

Do not begin Form Builder Phase 1 automatically.

Wait for review.
