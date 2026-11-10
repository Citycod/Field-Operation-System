# AGENT_RULES.md
# Codex / Antigravity Backend Implementation Rules

These rules are mandatory for backend implementation in the **Field Workforce & Operations Management Platform**.

## Product Boundary

1. The product is the **Field Workforce & Operations Management Platform**.
2. The **Form Builder / Form Engine is one module only**.
3. Do not place all domain data into Form Engine JSON.
4. Do not hardcode Visitor, Purchase Requisition, HSE or any other example process into Form Engine core logic.
5. Each business module owns its own business data and lifecycle.
6. Do not invent new module responsibilities without updating the architecture source of truth.

## Architecture

7. Use the approved modular-monolith architecture during MVP.
8. Keep business/domain logic out of React components.
9. Use the application-service → repository-interface → Supabase-adapter layering.
10. Repositories handle persistence, not business orchestration.
11. Core reusable logic must not import the Supabase SDK, Next.js request objects or React.
12. Keep Supabase behind repositories/adapters and shared infrastructure boundaries.
13. Reuse shared Auth, Storage, Audit, Notification and Approval capabilities instead of creating module-specific replacements.
14. Do not introduce microservices, Kubernetes, Kafka, RabbitMQ, event sourcing or distributed sagas unless explicitly approved later.

## Tenancy & Authorization

15. Every tenant-owned record requires `organization_id`.
16. Use server-derived authenticated identity.
17. Never trust client-supplied:
   - user IDs
   - roles
   - tenant memberships
   - permission flags
   - unrestricted organization IDs
18. Resolve and verify active organisation membership on the server/database path.
19. Add RLS for every new tenant-owned table.
20. Use RLS for tenant isolation and application/server authorization for action-level permissions.
21. Protect cross-tenant relationships at database level where practical.
22. Add tests proving tenant isolation.
23. Do not use service-role credentials as the default normal-user request path.
24. Platform super-admin operations must use explicit server-only privileged pathways.

## Database & Data Ownership

25. PostgreSQL is the source of truth.
26. Use relational tables for stable business/domain concepts.
27. Use JSONB for dynamic form schemas/answers or flexible metadata where appropriate.
28. Do not replace well-defined domain entities with one generic JSON table.
29. Every new tenant-owned table should include:
   - `id uuid`
   - `organization_id uuid not null`
   - relevant foreign keys
   - timestamps
   - appropriate indexes
   - RLS
30. Prefer tenant-aware/composite foreign-key protection for sensitive cross-tenant relationships where practical.
31. Use migrations for database changes.
32. Do not manually duplicate reporting totals as a second source of truth unless explicitly justified.

## Transactions & Lifecycle

33. Use transactions/RPCs for multi-record state transitions that must succeed atomically.
34. Examples include:
   - publishing a form version
   - approving the current stage and activating the next stage
   - closing a work order and writing completion state
35. Treat published form versions, approval decisions, audit events and similar historical records as immutable history.
36. Do not mutate published/historical data casually.

## Forms

37. The Form Engine owns:
   - forms
   - form versions
   - schema validation
   - renderer contracts
   - configurable fields/tabs/rules/list view
   - form submissions
   - detail rows
   - notes/documents integration
   - configurable approval references
38. A business module may link forms to its records, but the business module remains authoritative for its own lifecycle.
39. Example: a Job may link a configurable service checklist, but Job status/assignment remains owned by the Jobs module.

## Storage & Files

40. Modules depend on `StorageService`, not provider-specific URLs.
41. Current implementation may use `SupabaseStorageService`.
42. Use provider-neutral storage keys:

```text
{organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}
```

43. Store file metadata in PostgreSQL.
44. Operational documents are private by default.
45. Use signed URLs or authenticated streaming where access is required.
46. Do not create separate storage engines for Form Builder, Jobs, HSE, Assets or Expenses.
47. Do not automatically hard-delete physical files because a UI reference is removed; follow module lifecycle/retention rules.

## Workflow / Approvals

48. MVP approval is sequential.
49. Supported core actions are:

```text
Approve
Reject
Return
```

50. Reuse the shared approval subsystem across modules where appropriate.
51. Do not create an independent approval-table set for every module.
52. Keep approval target types controlled.
53. Do not introduce advanced workflow infrastructure or message brokers prematurely.

## Audit, Notifications & Reporting

54. Audit uses a shared append-only capability.
55. Audit logs are not editable business notes.
56. Business modules emit meaningful events; notification delivery is handled by the shared notification service.
57. Initial notification channels are in-app and email.
58. Reporting reads authoritative module data through services, queries or SQL views.
59. Every dashboard/report metric must have an explicit source query and tenant scope.

## Implementation Discipline

60. Read the consolidated backend architecture before implementing a new module.
61. Implement one requested phase/module at a time.
62. Do not invent backend APIs from UI mockups.
63. Do not query unrelated module tables directly from React components.
64. Before a new module is treated as production-ready, define:
   1. domain owner
   2. tables
   3. lifecycle/status model
   4. service interface
   5. repository interface
   6. RLS
   7. cross-module contracts
   8. audit events
   9. tests
   10. migration
65. Stop after the requested phase/module and report:
   - files changed
   - migrations
   - RLS/security changes
   - tests
   - lint
   - typecheck
   - build
66. Do not silently expand scope.
