# Supabase Portability & Infrastructure Exit Architecture

**Status:** Approved Architectural Strategy  
**Target:** Field Workforce & Operations Management Platform

---

## 1. Executive Summary

The **Field Workforce & Operations Management Platform** uses **Supabase** for MVP and early-stage production because it provides an open-source, fast-path infrastructure combining **PostgreSQL**, **Auth**, **Storage**, and **Row Level Security (RLS)**.

However, to prevent vendor lock-in, all business domain modules (including the **Form Builder Engine**, **HSE**, **Jobs**, **Procurement**, and **Assets**) interact with infrastructure exclusively through **application abstraction boundaries**.

---

## 2. Infrastructure Architecture & Abstraction Boundaries

```text
               ┌────────────────────────────────────────────────────────┐
               │              React / Next.js UI Shell                  │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │     Application Domain Services & Form Engine         │
               │   (Pure TypeScript Domain - Zero @supabase Imports)    │
               └──────────────┬──────────────────┬──────────────────────┘
                              │                  │
                              ▼                  ▼
              ┌────────────────────────┐  ┌────────────────────────┐
              │ StorageService (Interface)│ │ AuthService / Repositories│
              └───────────────┬────────┘  └──────────┬─────────────┘
                              │                      │
                              ▼                      ▼
              ┌────────────────────────┐  ┌────────────────────────┐
              │ SupabaseStorageService │  │ SupabaseAuthService /  │
              │  (platform-files)      │  │ Supabase Repositories  │
              └───────────────┬────────┘  └──────────┬─────────────┘
                              │                      │
                              ▼                      ▼
               ┌────────────────────────────────────────────────────────┐
               │              PostgreSQL + Supabase Platform            │
               └────────────────────────────────────────────────────────┘
```

### Abstraction Rules:
1. **Zero Provider SDK Leakage in Form Engine**: `packages/form-engine` has 0 dependencies on `@supabase/supabase-js` or `@supabase/ssr`.
2. **Provider-Neutral Storage Keying**: Object keys follow the strict standard `{organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}`. Storage APIs return signed URLs or provider-neutral keys, never raw hardcoded CDN URLs.
3. **Session-Enforced Authorization**: `userId` from client inputs is NEVER trusted for server-side authorization. User identity is derived strictly from the authenticated Supabase session context (`auth.uid()`, `assertTenantAccessFromSession`).

---

## 3. Long-Term Deployment & Migration Paths

```text
               ┌────────────────────────────────────────┐
               │       Stage 1: Managed Supabase        │
               │        (Cloud Production MVP)          │
               └───────────────────┬────────────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │    Evaluate Scale, Costs & Compliance  │
               └─────────┬────────────────────┬─────────┘
                         │                    │
                         ▼                    ▼
     ┌──────────────────────────────┐     ┌──────────────────────────────┐
     │   Future Path A (Self-Host)  │     │   Future Path B (Decoupled)  │
     │  Self-Hosted Supabase Stack │     │ PostgreSQL + Custom Stack    │
     │  (Docker / K8s / Supabase)   │     │ (Auth + S3 Storage)          │
     └──────────────────────────────┘     └──────────────────────────────┘
```

---

## 4. Migration Exit Strategies

### Future Path A: Self-Hosted Supabase
If cloud costs or data residency requirements necessitate moving off Supabase Cloud, the platform can be deployed to self-hosted infrastructure:
- **Database**: Run standard PostgreSQL with Supabase extensions enabled.
- **Auth & Storage**: Run Supabase Auth (`gotrue`) and Storage API services via Docker / Kubernetes.
- **Code Changes**: **Zero code changes required**. Only update `NEXT_PUBLIC_SUPABASE_URL` to point to the self-hosted endpoint.

---

### Future Path B: Decoupled Infrastructure Stack
If the platform migrates to a custom enterprise infrastructure stack (e.g. managed AWS / GCP / Azure):

#### A. Database Migration (PostgreSQL)
- **Engine**: Standard PostgreSQL (Neon, AWS RDS PostgreSQL, GCP Cloud SQL).
- **Strategy**:
  1. Dump schema and data via standard `pg_dump`.
  2. Restore via `pg_restore` into the target PostgreSQL database.
  3. Re-apply committed migration SQL files in `supabase/migrations/`.
  4. Preserve RLS policies or transition RLS to application-level authorization guards.

#### B. Storage Migration (S3-Compatible Storage)
- **Engine Options**: AWS S3, Cloudflare R2, MinIO, Google Cloud Storage.
- **Strategy**:
  1. Transfer object files using `aws s3 sync` or `rclone` preserving the neutral storage key pattern `{organization_id}/{module}/{entity_id}/{uuid}-{filename}`.
  2. Implement `S3StorageService` or `CloudflareR2StorageService` adhering to `StorageService` interface.
  3. Swap implementation binding in `StorageService` factory.

#### C. Authentication Migration (Open Source & Managed Auth Options)
- **Open-Source & Self-Hostable Options**:
  - **Better Auth**: Modern TypeScript-first, self-hostable session auth engine.
  - **Keycloak**: Enterprise open-source IAM supporting SAML 2.0, OpenID Connect, and multi-tenant realm federation.
- **Managed Provider Options**:
  - Clerk, Auth0, Kinde, AWS Cognito.
- **Strategy**:
  1. Migrate user identities from `auth.users` via exported user IDs and hashed credentials.
  2. Implement `CustomAuthService` matching `AuthService` interface.
  3. Update `apps/web/src/lib/supabase/middleware.ts` cookie session refresh handler.

---

## 5. Summary of Architectural Guarantees

- **PostgreSQL Source of Truth**: Data models, foreign keys, indexes, and constraints exist as standard SQL migrations under `supabase/migrations/`.
- **Decoupled Business Logic**: No React component or domain service performs direct `supabase.from()` calls.
- **Multi-Tenant Security**: Tenant isolation is enforced at PostgreSQL RLS layer + server-side `assertTenantAccessFromSession()` context checks.
