# Platform Architecture Overview

## 1. High-Level Architecture

The **Field Workforce & Operations Management Platform** is structured as a multi-tenant SaaS monorepo.

```text
               ┌───────────────────────────────┐
               │    Next.js PWA (apps/web)     │
               └───────────────┬───────────────┘
                               │ Supabase JS / SSR Client
                               ▼
               ┌───────────────────────────────┐
               │       Supabase Platform       │
               │  (PostgreSQL + Auth + Storage)│
               └───────┬───────────────┬───────┘
                       │               │
            PostgreSQL │               │ Storage API
                       ▼               ▼
          ┌─────────────────┐    ┌────────────────────────┐
          │ PostgreSQL DB   │    │ Supabase Storage       │
          │ (Multi-tenant)  │    │ (platform-files Bucket)│
          └─────────────────┘    └────────────────────────┘
```

## 2. Shared Multi-Tenancy Model

All operational entities belong to an **Organization** (tenant).

```text
auth.users ──► organization_memberships ──► organizations
                                                  │
                                                  ├── Form Definitions
                                                  ├── Form Submissions
                                                  ├── Work Orders / Jobs
                                                  └── Assets / Evidence
```

### Multi-Tenancy Enforcement Principles:
1. **Database Schema Level:** Every tenant-owned table contains `organization_id`.
2. **Database Security Boundary:** PostgreSQL Row Level Security (RLS) policies enforce `organization_id` isolation using `auth.uid()` and `is_organization_member()`.
3. **Application Layer:** Frontend utilities (`validateOrganizationMembership`, `useAuth`) guard user context and role authorization.

## 3. Form Builder Module Integration

The Form Builder is **one module within the platform shell**, not an isolated app. It provides form capabilities (definitions, submissions, approvals) to other operational domain modules (Procurement, HSE, Maintenance, Jobs).
