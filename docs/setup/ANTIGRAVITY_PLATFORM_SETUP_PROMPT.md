# Antigravity Project Setup Prompt
> [!NOTE]
> **Superceded Notice:** The initial Directus backend choice described in this document was migrated to **Supabase** via `ANTIGRAVITY_DIRECTUS_TO_SUPABASE_CORRECTION_PROMPT.md`.

## Field Workforce & Operations Management Platform — Initial Foundation Setup

You are setting up the initial codebase for a production-grade **Field Workforce & Operations Management Platform**.

This is the wider platform. The **Form Builder is only one reusable module inside this platform**, not a standalone application.

Do **not** start implementing the Form Builder MVP yet. Your job in this step is to create the correct project foundation so that Codex can later implement the approved MVP against a clean, stable architecture.

---

# 1. Product Context

The platform is a multi-tenant SaaS for field-service and operational businesses.

Initial target markets:
- Nigeria
- United Kingdom

Initial verticals:
- Oil & Gas Services
- Equipment Rental & Maintenance

Future/use-case modules include:
- Organisations / Tenants
- Users / Employees
- Customers
- Sites
- Jobs / Work Orders
- Scheduling / Dispatch
- Employee Self Service
- Timesheets
- Expense Requisitions / Claims
- Assets
- Preventive Maintenance
- HSE / Compliance
- Documents
- Contracts
- Job Costing
- Reporting
- Customer Portal
- Form Builder
- Workflow / Approvals
- Visitor Management
- future operational modules

The Form Builder must eventually be reusable by these modules.

Examples:

```text
Procurement → Purchase Requisition Form
HSE → Inspection / Incident Form
Assets → Asset Inspection Form
Jobs → Service Report Form
Expenses → Expense Request Form
Visitor Management → Visitor Registration Form
```

Do not architect the Form Builder as a separate SaaS product.

---

# 2. Agreed Technology Stack

Use the agreed platform stack:

## Frontend
- Next.js
- React
- TypeScript
- App Router
- responsive web application
- PWA-first architecture

## Backend / API / Admin Data Layer
- Directus

Directus is the platform backend/data/API layer.

Do not replace Directus with:
- NestJS
- Express
- Supabase
- Firebase
- custom CRUD backend

unless explicitly instructed later.

Custom Directus extensions/hooks/endpoints may be added later for business logic that should not live in basic CRUD permissions.

## Database
- PostgreSQL

Directus must use PostgreSQL.

## File/Object Storage
- S3-compatible object storage

The codebase must be provider-neutral where possible.

Production can use:
- Cloudflare R2
- AWS S3
- another S3-compatible provider

For local development, use a suitable local S3-compatible option if needed, but do not couple application code directly to a specific vendor.

## Cache / Queues
- Redis is **later**, not required for initial setup unless a very small optional Docker service is created and disabled by default.

Do not build queue infrastructure yet.

## Mobile
- PWA first
- native mobile app later

Do not create Flutter or React Native projects now.

## Multi-tenancy
Multi-tenancy is mandatory from the beginning.

## Compliance direction
Architecture must remain suitable for:
- Nigeria Data Protection Act / NDPA considerations
- UK GDPR considerations

Do not implement a full compliance system during setup, but avoid architecture that makes tenant isolation, auditability, retention, and access control difficult.

---

# 3. Important Scope Rule

This setup phase is infrastructure/foundation only.

Do not yet implement:
- full Form Builder
- Visitor App
- AI
- templates
- offline synchronization
- payments
- advanced workflow engine
- native mobile app
- advanced analytics
- production notification provider
- Redis queues

It is acceptable to create placeholders/modules/interfaces for later work.

---

# 4. Repository Strategy

Use a clean monorepo/workspace structure.

Preferred package manager:
- pnpm

Use pnpm workspaces.

Recommended structure:

```text
field-workforce-platform/
├── apps/
│   └── web/
│       └── Next.js application
│
├── directus/
│   ├── extensions/
│   ├── snapshots/
│   └── README.md
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   └── form-engine/
│       └── placeholder only for now
│
├── docs/
│   └── form-builder/
│       └── existing approved documentation will be placed here
│
├── infra/
│   └── docker/
│
├── .env.example
├── .editorconfig
├── .gitignore
├── .nvmrc
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

If there is a strong technical reason to adjust this exact structure, explain it before changing the architecture.

---

# 5. Node / Package Version Policy

Use stable mutually compatible versions of:
- Node.js
- Next.js
- React
- TypeScript
- Directus
- PostgreSQL client tooling

Pin the selected Node version in:
- `.nvmrc`
- root `package.json` engines

Do not use experimental/canary packages.

Do not mix npm/yarn/pnpm lockfiles.

Use only:
- `pnpm-lock.yaml`

---

# 6. Web Application Setup

Create `apps/web` as the main platform application.

Configure:

- Next.js App Router
- TypeScript strict mode
- ESLint
- sensible formatting setup
- absolute path aliases
- environment validation
- server/client separation
- production-safe error handling foundation

Suggested initial directories:

```text
apps/web/src/
├── app/
│   ├── (auth)/
│   ├── (platform)/
│   │   ├── dashboard/
│   │   ├── forms/
│   │   ├── submissions/
│   │   ├── approvals/
│   │   └── administration/
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── layout/
│   ├── navigation/
│   └── common/
│
├── features/
│   ├── auth/
│   ├── organisations/
│   └── form-builder/
│       └── placeholder/
│
├── lib/
│   ├── directus/
│   ├── auth/
│   ├── permissions/
│   ├── env/
│   └── utils/
│
└── styles/
```

Do not build the Form Builder UI yet.

Create only a placeholder route/module proving it lives inside the platform shell.

---

# 7. Platform Shell

Create the initial authenticated platform shell with:

- top/global application area
- left navigation
- main content area
- responsive behavior
- placeholder organisation/workspace context
- placeholder user/account control

The visual language should be ready for our approved enterprise direction:

- white/light-gray content surfaces
- green primary/accent direction
- compact enterprise controls
- restrained borders
- minimal decorative shadows
- no generic colorful SaaS marketing dashboard styling

Do not spend excessive time polishing this yet.

The important point is that later modules, including Form Builder, live inside one shared platform shell.

---

# 8. PWA Foundation

Set the project up as **PWA-ready**.

For this phase:
- create web manifest
- add installable-app metadata structure
- add icons/placeholders if required
- ensure responsive viewport/meta setup

Do not implement offline business-data synchronization yet.

Offline synchronization is explicitly outside the Form Builder MVP.

Do not add complex caching that can cause stale operational data.

---

# 9. Directus Setup

Create a Directus development environment using PostgreSQL.

Directus must be treated as shared platform infrastructure.

Prepare:

```text
directus/
├── extensions/
├── snapshots/
└── README.md
```

The Directus setup should be suitable for:
- schema snapshots
- custom hooks/endpoints later
- repeatable local setup
- environment-based config

Do not manually edit Directus internal system tables.

Use supported Directus configuration/migration/snapshot mechanisms.

---

# 10. PostgreSQL / Initial Platform Data Model

For initial setup, create only the core platform tenancy/identity domain needed before Form Builder implementation.

Do not fully create all Form Builder tables yet unless they are required by the existing documentation's first implementation phase.

Core platform concepts:

```text
organizations
organization_memberships
```

Reuse Directus user/auth identity rather than inventing a second unrelated user system.

Create/plan organisation membership so a Directus user can belong to one or more organisations.

Minimum conceptual fields:

## organizations

```text
id
name
slug
status
created_at
updated_at
```

## organization_memberships

```text
id
organization_id
user_id
role_key / role reference
status
created_at
updated_at
```

Enforce uniqueness for:

```text
organization_id + user_id
```

Do not yet create every future module table.

---

# 11. Authentication

Use Directus authentication as the initial platform authentication mechanism unless the existing repository already has an approved identity solution.

Create a clean frontend abstraction around authentication.

Do not scatter raw authentication calls across React components.

Suggested:

```text
lib/auth/
lib/directus/
```

The frontend should have a clear concept of:
- authenticated user
- active organization
- membership
- permissions

Do not assume that a logged-in user automatically has access to every organisation.

---

# 12. Directus Client Layer

Use the official Directus SDK.

Create a clean server-side Directus client abstraction.

Avoid Directus calls directly inside arbitrary UI components.

Recommended boundary:

```text
apps/web/src/lib/directus/
├── client.ts
├── server.ts
├── auth.ts
└── types.ts
```

Where appropriate:
- server components/server actions use server-side client
- browser client only gets the minimum needed capability

Never expose Directus admin/static privileged tokens to the browser.

---

# 13. Multi-Tenancy Foundation

This is critical.

The platform is multi-tenant from day one.

Every future tenant-owned collection will include:

```text
organization_id
```

The setup must establish the pattern:

```text
authenticated user
      ↓
organisation membership
      ↓
active organisation context
      ↓
tenant-scoped query/action
```

Do not implement tenant security as only:

```ts
array.filter(...)
```

on the frontend.

Tenant rules must ultimately be enforced through Directus permissions/policies and/or trusted server-side service logic.

Prepare helper abstractions such as:

```text
getCurrentUser()
getActiveOrganization()
requireOrganizationMembership()
requirePermission()
```

These can initially be small foundations/placeholders, but their intended architecture must be clear.

---

# 14. Roles and Permissions Foundation

Do not build a huge RBAC engine yet.

Prepare for conceptual platform roles:

```text
Platform Super Admin
Business Admin
Manager / Approver
Employee / Requester
```

Prefer capability-based checks over hardcoding UI logic everywhere.

Future permissions include:

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

Use Directus roles/policies where appropriate, but application-level business authorization may still be needed for contextual workflow rules.

---

# 15. Shared Packages

## `packages/ui`

Create a minimal shared UI package/design foundation.

Include only reusable primitives needed by platform setup, for example:

- Button
- Input
- Select
- Dialog
- Drawer
- Tabs
- Table primitives
- Badge
- Form field wrapper
- Empty State
- Loading State

Do not attempt to build the entire Form Builder component library yet.

Keep components enterprise-friendly and accessible.

---

## `packages/types`

Shared platform types that are safe to share between modules.

Do not duplicate Directus-generated types manually if a reliable generation mechanism exists.

---

## `packages/config`

Shared:
- TypeScript configuration
- lint config if appropriate
- shared constants/config patterns

---

## `packages/form-engine`

Create only the placeholder package/folder and README explaining that this will later contain:

```text
schema
registry
renderer
rules
calculations
validation
versioning
```

Do not implement the actual engine during project setup.

Codex will use the approved Form Builder documentation to implement it afterward.

---

# 16. Environment Variables

Create a complete `.env.example`.

Never commit secrets.

Include clear placeholders for at least:

```env
# Web
NEXT_PUBLIC_APP_NAME=
NEXT_PUBLIC_APP_URL=

# Directus
DIRECTUS_URL=
DIRECTUS_PUBLIC_URL=

# PostgreSQL / Directus database
DB_CLIENT=pg
DB_HOST=
DB_PORT=
DB_DATABASE=
DB_USER=
DB_PASSWORD=

# Directus
DIRECTUS_KEY=
DIRECTUS_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD=

# Storage
STORAGE_LOCATIONS=
STORAGE_S3_DRIVER=s3
STORAGE_S3_KEY=
STORAGE_S3_SECRET=
STORAGE_S3_BUCKET=
STORAGE_S3_REGION=
STORAGE_S3_ENDPOINT=

# Optional later
REDIS_URL=
```

Use the actual environment variable names expected by the chosen Directus version.

If names differ, use Directus-supported names and document them.

Never expose:
- DB password
- Directus secret
- S3 secret
- admin token

through `NEXT_PUBLIC_*`.

---

# 17. Local Development / Docker

Create a reproducible local development setup.

Recommended Docker services:

```text
postgres
directus
```

Optional local S3-compatible storage only if needed.

Redis should not be a required service yet.

Provide:
- `docker-compose.yml` or equivalent
- persistent volumes
- healthchecks where reasonable
- clear local ports
- no hardcoded production secrets

The Next.js app may run locally outside Docker for developer speed unless there is a strong reason to containerize it immediately.

---

# 18. Scripts

Root scripts should make the repo easy to use.

Recommended:

```json
{
  "scripts": {
    "dev": "...",
    "dev:web": "...",
    "dev:directus": "...",
    "build": "...",
    "lint": "...",
    "typecheck": "...",
    "test": "...",
    "format": "...",
    "format:check": "..."
  }
}
```

If using a monorepo task runner, keep configuration simple.

Do not introduce unnecessary orchestration complexity.

---

# 19. Quality Tooling

Set up:

- TypeScript strict mode
- ESLint
- formatting
- Git-friendly consistent line endings
- basic unit-test framework
- basic browser/E2E test foundation if reasonable
- pre-commit tooling only if it stays lightweight

Do not make Git hooks so strict/slow that they impede development.

---

# 20. Testing Foundation

Prepare for:

## Unit tests
- shared utilities
- schema/rules later

## Integration tests
- Directus data access later
- tenant enforcement later

## E2E
Use an appropriate browser automation framework, e.g. Playwright, if compatible with the project.

Create one simple smoke test:

```text
app loads
→ authenticated/platform placeholder route renders
```

Do not write the full Form Builder test suite yet.

---

# 21. Error and Logging Foundation

Provide a basic structured approach for:

- server errors
- client-friendly error messages
- development logs
- future audit event integration

Do not log:
- passwords
- tokens
- secrets
- raw sensitive documents

---

# 22. File Storage Architecture

Set up the Directus file/storage configuration abstraction for S3-compatible storage.

Do not put uploaded binary files directly into PostgreSQL.

Later Form Builder Documents/Files will use this shared platform file infrastructure.

This is important:

```text
Platform storage
      ↑
Form Builder documents
Jobs documents
HSE evidence
Asset files
Other modules
```

Do not create a Form-Builder-specific storage system.

---

# 23. Audit Architecture

Do not build full audit UI yet.

Prepare the architecture so critical module actions can later use shared platform audit logging.

The Form Builder should eventually emit events such as:

```text
form_created
form_published
submission_submitted
approval_approved
file_deleted
```

But audit infrastructure belongs to the wider platform.

Do not make Form Builder own a completely isolated audit framework.

---

# 24. Documentation Integration

Create/retain:

```text
docs/form-builder/
```

The approved Codex Form Builder documentation pack will be copied into this directory.

Codex must later treat those documents as implementation source of truth.

Also create:

```text
docs/architecture/
```

with a short `PLATFORM-ARCHITECTURE.md` describing:

```text
Next.js
   ↓
Directus
   ↓
PostgreSQL

Directus
   ↓
S3-compatible object storage
```

and the tenancy principle.

---

# 25. Form Builder Module Placeholder

Create a placeholder route inside the platform:

```text
/forms
```

or equivalent module route consistent with chosen naming.

For now it should only show something like:

```text
Form Builder

This module will contain:
- Form Library
- Builder
- Rules
- Workflow
- List View
- Versions
```

It must use the platform shell.

Do not implement the real screens yet.

This confirms:

> Form Builder is part of the platform, not a separate app.

---

# 26. Initial Navigation

Add placeholder navigation entries only for useful foundation sections.

Suggested:

```text
Dashboard

Operations
- Jobs (placeholder)
- Assets (placeholder)

Management
- Form Builder
- Approvals

Administration
- Organisations
- Users / Employees
- Data Sources
```

Do not create dozens of fake pages just to populate navigation.

Keep placeholders minimal.

---

# 27. Security Rules During Setup

Never:
- expose privileged Directus token in browser
- commit secrets
- trust organization ID from client without validation
- make S3 bucket public by default
- create public admin APIs
- disable Directus permissions globally for convenience
- use wildcard production CORS without justification
- hardcode credentials

Use development defaults safely and document production requirements separately.

---

# 28. What NOT to Build in This Setup Task

Stop before implementing:

```text
Form schema v1
Form renderer
Drag/drop builder
Rules engine
Calculation engine
Approval engine
Submission engine
Visitor App
```

Those are the next Codex implementation stages and already have approved specifications.

The only exception is small placeholder types/folders required to establish module boundaries.

---

# 29. Required Deliverables

When setup is complete, provide a report with:

## A. Repository tree

Show the resulting structure.

## B. Stack versions

List:
- Node
- pnpm
- Next.js
- React
- TypeScript
- Directus
- PostgreSQL target

## C. Commands

Exact commands for:

```text
install
start database/directus
start web app
lint
typecheck
test
build
```

## D. Environment setup

Explain:
- which `.env` files are needed
- what I must fill in manually

Do not print real secrets.

## E. Directus setup

Explain:
- local URL
- admin bootstrap
- PostgreSQL connection
- schema/snapshot workflow

## F. Multi-tenancy foundation

Explain exactly what was created.

## G. What is intentionally NOT implemented yet

Explicitly state that Form Builder engine implementation has not begun.

## H. Validation

Run and report:
- dependency install
- lint
- typecheck
- tests
- production build

Fix setup errors before declaring complete.

---

# 30. Final Setup Acceptance Criteria

The setup is complete only when:

- monorepo installs cleanly
- Next.js app runs
- Directus runs
- Directus connects to PostgreSQL
- web app can communicate with Directus through the intended abstraction
- authentication foundation is present
- organisation/membership foundation is present
- platform shell renders
- Form Builder exists as a placeholder module inside platform shell
- S3-compatible storage configuration is documented/prepared
- PWA foundation exists without offline business-data sync
- lint passes
- typecheck passes
- test/smoke test passes
- production build passes
- no secrets are committed
- documentation explains how to start the project

Do not move into Form Builder implementation automatically.

Stop after setup and give me the completion report so I can review it before I hand the project to Codex.
