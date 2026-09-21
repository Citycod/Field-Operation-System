# Platform Architecture Overview

## 1. High-Level Architecture

The **Field Workforce & Operations Management Platform** is structured as a multi-tenant SaaS monorepo.

```text
               ┌───────────────────────────────┐
               │    Next.js PWA (apps/web)     │
               └───────────────┬───────────────┘
                               │ HTTP / Directus SDK
                               ▼
               ┌───────────────────────────────┐
               │  Directus API & Data Layer    │
               └───────┬───────────────┬───────┘
                       │               │
            PostgreSQL │               │ S3 Protocol
                       ▼               ▼
          ┌─────────────────┐    ┌────────────────────────┐
          │ PostgreSQL DB   │    │ Cloudflare R2 / S3     │
          │ (Multi-tenant)  │    │ (Shared Media/Files)   │
          └─────────────────┘    └────────────────────────┘
```

## 2. Shared Multi-Tenancy Model

All operational entities belong to an **Organization** (tenant).

```text
User ──► OrganizationMembership ──► Organization
                                         │
                                         ├── Form Definitions
                                         ├── Form Submissions
                                         ├── Work Orders / Jobs
                                         └── Assets / Evidence
```

### Multi-Tenancy Enforcement Principles:
1. **Database Schema Level:** Every tenant-owned table contains `organization_id`.
2. **Backend API Level:** Directus roles and custom security filters enforce `organization_id` isolation.
3. **Application Layer:** Frontend utilities (`requireOrganizationMembership`, `getActiveOrganization`) guard context.

## 3. Form Builder Module Integration

The Form Builder is **one module within the platform shell**, not an isolated app. It provides form capabilities (definitions, submissions, approvals) to other operational domain modules (Procurement, HSE, Maintenance, Jobs).
