# 03 — PostgreSQL Data Model v1

**Status:** Implementation contract  
**Purpose:** Define persistence, relationships, tenant ownership, constraints, and indexes for the MVP.

---

## 1. Principles

1. PostgreSQL is the source of truth.
2. Dynamic schema/submission payloads may use JSONB.
3. Stable domain concepts use relational tables.
4. Every tenant-owned table includes `organization_id`.
5. Published form versions are immutable.
6. Binary files live in object storage.
7. Notes and approvals are append/history oriented.
8. Repeating detail rows have stable relational identity.

Use UUID/ULID according to repository convention.

Examples below use UUID-like IDs conceptually.

---

## 2. Entity map

```text
organizations
  ├── organization_memberships
  │      └── users
  │
  ├── forms
  │      └── form_versions
  │             └── form_submissions
  │                    ├── submission_detail_rows
  │                    ├── files
  │                    ├── notes
  │                    └── approval_instances
  │                           ├── approval_stage_instances
  │                           └── approval_decisions
  │
  └── data_sources
         ├── data_source_fields
         └── data_source_items
```

---

## 3. organizations

Suggested columns:

```text
id                  uuid pk
name                text not null
slug                text not null unique
status              text not null
created_at          timestamptz not null
updated_at          timestamptz not null
```

Indexes:
- unique(slug)

---

## 4. users

Use existing auth user table if already present.

Conceptual:

```text
id
email
display_name
status
created_at
updated_at
```

Do not duplicate auth identity unnecessarily.

---

## 5. organization_memberships

```text
id                  uuid pk
organization_id     uuid not null fk organizations
user_id             uuid not null fk users
role_id             uuid/null depending RBAC model
status              text not null
created_at
updated_at
```

Constraints:
- unique(organization_id, user_id)

Indexes:
- organization_id
- user_id
- (organization_id, role_id)

---

## 6. roles / role_permissions

If platform RBAC already exists, reuse it.

Conceptual:

```text
roles
- id
- organization_id nullable for global roles
- key
- name

role_permissions
- role_id
- permission_key
```

---

## 7. forms

One logical form across versions.

```text
id                           uuid pk
organization_id              uuid not null
key                          text not null
title                        text not null
description                  text null
status                       text not null
current_draft_version_id     uuid null
current_published_version_id uuid null
created_by                   uuid not null
created_at                   timestamptz not null
updated_at                   timestamptz not null
archived_at                  timestamptz null
```

Constraints:
- unique(organization_id, key)

Indexes:
- organization_id
- (organization_id, status)
- current_published_version_id

Do not store the full editable schema here if `form_versions` is the canonical schema source.

---

## 8. form_versions

```text
id                  uuid pk
organization_id     uuid not null
form_id             uuid not null
version_number      integer not null
status              text not null -- draft/published/archived
schema_version      integer not null
schema_jsonb        jsonb not null
change_note         text null
created_by          uuid not null
created_at          timestamptz not null
published_by        uuid null
published_at        timestamptz null
```

Constraints:
- unique(form_id, version_number)
- at most one active draft per form if that is chosen MVP rule
- published row immutable at application layer

Indexes:
- (organization_id, form_id)
- (form_id, status)
- published_at

Potential JSONB GIN index is not required initially unless query needs justify it.

---

## 9. data_sources

```text
id                  uuid pk
organization_id     uuid not null
key                 text not null
name                text not null
description         text null
display_field_key   text not null
value_field_key     text not null
status              text not null
created_by
created_at
updated_at
```

Constraints:
- unique(organization_id, key)

---

## 10. data_source_fields

```text
id                  uuid pk
organization_id     uuid not null
data_source_id      uuid not null
key                 text not null
label               text not null
field_type          text not null
required            boolean not null default false
order_index         integer not null
config_jsonb        jsonb not null default '{}'
```

Constraints:
- unique(data_source_id, key)

Indexes:
- (organization_id, data_source_id)

---

## 11. data_source_items

Flexible MVP option:

```text
id                  uuid pk
organization_id     uuid not null
data_source_id      uuid not null
data_jsonb          jsonb not null
status              text not null default 'active'
created_by
created_at
updated_at
```

Indexes:
- (organization_id, data_source_id, status)

Optional:
- generated/search columns if performance requires it

Do not over-index JSONB before usage patterns are known.

---

## 12. form_submissions

```text
id                  uuid pk
organization_id     uuid not null
form_id             uuid not null
form_version_id     uuid not null
reference_number    text null
status              text not null
data_jsonb          jsonb not null default '{}'
created_by           uuid not null
submitted_by         uuid null
created_at           timestamptz not null
updated_at           timestamptz not null
submitted_at         timestamptz null
completed_at         timestamptz null
```

Constraints:
- form_version_id must belong to form_id
- form/form_version must belong to same organization
- optional unique(organization_id, reference_number) if numbering guarantees uniqueness

Indexes:
- (organization_id, form_id)
- (organization_id, form_id, status)
- (organization_id, created_by)
- submitted_at
- reference_number

---

## 13. submission_detail_rows

```text
id                  uuid pk
organization_id     uuid not null
submission_id       uuid not null
tab_id              text not null
row_order           integer not null
data_jsonb          jsonb not null default '{}'
created_by          uuid not null
created_at          timestamptz not null
updated_at          timestamptz not null
deleted_at          timestamptz null
```

Indexes:
- (organization_id, submission_id, tab_id)
- (submission_id, row_order)

Why relational identity:
- row attachments
- future audit
- future offline
- reporting
- safe edit/delete

---

## 14. files

```text
id                  uuid pk
organization_id     uuid not null
submission_id       uuid null
detail_row_id       uuid null
tab_id              text null
field_id            text null

file_name           text not null
mime_type           text not null
size_bytes          bigint not null
storage_key         text not null
checksum            text null

uploaded_by         uuid not null
created_at          timestamptz not null
deleted_at          timestamptz null
```

Constraints:
- file must be attached to a valid authorized context
- storage_key unique if storage convention supports it

Indexes:
- organization_id
- submission_id
- detail_row_id

Delete behavior:
- soft delete metadata first if audit required
- object deletion coordinated through FileService

---

## 15. notes

```text
id                         uuid pk
organization_id            uuid not null
submission_id              uuid not null
tab_id                     text not null
approval_stage_instance_id uuid null
author_id                   uuid not null
visibility                  text not null
message                     text not null
created_at                  timestamptz not null
```

Optional future:
- supersedes_note_id
- edited_at

MVP behavior:
append only.

Indexes:
- (organization_id, submission_id, created_at)
- approval_stage_instance_id

---

## 16. approval_instances

One workflow runtime per submission/cycle.

```text
id                  uuid pk
organization_id     uuid not null
submission_id       uuid not null
form_version_id     uuid not null
status              text not null
current_stage_order integer null
cycle_number        integer not null default 1
started_at          timestamptz not null
completed_at        timestamptz null
created_at          timestamptz not null
```

Indexes:
- (organization_id, submission_id)
- (organization_id, status)

---

## 17. approval_stage_instances

```text
id                    uuid pk
organization_id       uuid not null
approval_instance_id  uuid not null
stage_definition_id   text not null
stage_order            integer not null
stage_name             text not null
status                 text not null
assigned_approver_id   uuid null
assigned_role_id       uuid null
started_at             timestamptz null
completed_at           timestamptz null
created_at             timestamptz not null
```

Indexes:
- (approval_instance_id, stage_order)
- (organization_id, assigned_approver_id, status)

---

## 18. approval_decisions

```text
id                    uuid pk
organization_id       uuid not null
stage_instance_id     uuid not null
approver_id           uuid not null
decision              text not null
comment               text null
created_at            timestamptz not null
```

Decision:
- approved
- rejected
- returned

Never overwrite rows.

Indexes:
- stage_instance_id
- (organization_id, approver_id)

---

## 19. audit_logs

```text
id                  uuid pk
organization_id     uuid null
actor_user_id       uuid null
action              text not null
entity_type         text not null
entity_id           text not null
metadata_jsonb      jsonb not null default '{}'
created_at          timestamptz not null
```

Indexes:
- (organization_id, created_at)
- (entity_type, entity_id, created_at)
- actor_user_id

Do not put secrets/raw files/passwords in metadata.

---

## 20. Referential integrity rules

Service layer must verify:
- `form_version.form_id == submission.form_id`
- all referenced entities belong to same org
- files cannot attach across tenants
- note author is authorized
- approval decision actor matches assignment/permission
- data-source reference belongs to same organization unless explicitly global

---

## 21. Deletion rules

Forms with historical submissions should not be hard-deleted casually.

Recommended:
- archive forms
- soft delete draft-only entities when needed
- published versions retained
- submissions retained per platform retention policy
- files deleted only with authorization and audit

---

## 22. Transaction boundaries

Use transactions for:
- publish version + update current published pointer
- submit submission + create approval instance
- approval decision + activate next stage + update submission status
- import validated form + create draft version
- delete file metadata + storage coordination where feasible

---

## 23. Reference number generation

If enabled:
- generated server-side
- tenant/form scoped
- concurrency safe

Do not calculate next reference by `COUNT(*) + 1`.

Use a sequence/counter strategy safe under concurrent submissions.

---

## 24. Tenant indexes

Most high-traffic tenant-owned indexes should begin with `organization_id`.

Example:

```sql
CREATE INDEX ... ON form_submissions
(organization_id, form_id, status);
```

This supports both isolation-aware querying and performance.

---

## 25. Migration discipline

- migrations are append-only
- never edit already-applied production migration
- schema changes accompanied by data migration where needed
- destructive changes require explicit review
