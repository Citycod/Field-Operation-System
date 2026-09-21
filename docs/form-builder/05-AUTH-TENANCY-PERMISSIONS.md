# 05 — Authentication, Multi-Tenancy & Permissions

**Status:** Security contract  
**Purpose:** Define how tenant isolation and authorization must work.

---

## 1. Security principle

Tenant isolation is server enforced.

Frontend filtering is convenience only.

Every protected operation must answer:

1. Who is the authenticated user?
2. Which organization/workspace are they operating in?
3. Are they a valid member?
4. What role/permissions do they have?
5. Does the target entity belong to that organization?
6. Are they allowed to perform this action in the current entity/status context?

---

## 2. Roles

Minimum conceptual roles:

### Platform Super Admin
Platform-level support/administration.
Must not accidentally bypass tenant boundaries in ordinary business routes.

### Business Admin
Can manage forms and organization-level Form Builder configuration.

### Requester / Employee
Can use published forms and manage own drafts/submissions according to form permission.

### Manager / Approver
Can review submissions they are permitted/assigned to approve.

A repository may have more roles. Map them to capabilities rather than hardcoding names throughout the UI.

---

## 3. Permission keys

Suggested capabilities:

```text
forms.read
forms.create
forms.edit
forms.publish
forms.import
forms.export

data_sources.read
data_sources.manage

submissions.create
submissions.read_own
submissions.read_all
submissions.edit_own
submissions.export

files.upload
files.download
files.delete

notes.add
notes.read_internal

approvals.read_assigned
approvals.decide

audit.read
```

Use existing platform permission conventions if present.

---

## 4. Tenant resolution

Preferred:
- authenticated session identifies user
- route/workspace identifies current organization
- server validates membership
- server establishes tenant context

Never:

```ts
const orgId = req.body.organizationId;
// use directly
```

Instead:

```ts
const org = await authorizeOrganizationContext(userId, requestedWorkspace);
```

Any client organization ID is only a hint and must be validated.

---

## 5. Entity authorization pattern

For any entity ID:

```text
load entity
→ verify entity.organization_id == authorized organization
→ verify action permission
→ apply entity/status-specific rule
```

Avoid querying by entity ID alone.

Prefer:

```sql
WHERE organization_id = $org
AND id = $id
```

---

## 6. Cross-tenant rules

Org A must never access Org B:
- forms
- form versions
- schemas
- submissions
- detail rows
- files
- notes
- data sources
- data-source items
- approval tasks
- approval decisions
- exports
- audit logs

This includes guessed IDs.

---

## 7. Builder permissions

Business Admin (or granted role) may:
- create
- edit Draft
- preview
- configure workflow/rules/list
- publish
- import/export definition

Ordinary Requester must not access Draft form definitions or builder endpoints.

---

## 8. Published form usage

Submission creation requires:
- authenticated member unless form explicitly public in a future scope
- form Published
- create permission
- current Published version exists

MVP should remain internal/private unless product requirements say otherwise.

---

## 9. Submission access

Suggested default:

Requester:
- create
- read own
- edit own Draft/Returned
- cannot edit Submitted/Pending/Approved unless state says otherwise

Business Admin:
- read all org submissions
- actions still subject to workflow/status rules

Approver:
- read submissions assigned to them
- decision actions only on active assigned stage

---

## 10. Approval authorization

Before a decision:
- workflow active
- stage active
- user matches resolved approver or authorized role
- stage not already decided
- submission not terminal
- same tenant

Decision endpoint should be idempotent/guarded against double-click/race.

---

## 11. Notes visibility

Server filters notes.

`internal` notes:
- only roles with internal-note permission

`requester_and_approvers`:
- requester + authorized approvers/admin

`all_authorized_users`:
- all users who can read submission

Client must not receive notes it cannot display.

---

## 12. File authorization

Files inherit submission/detail/tab context.

Before download:
- tenant check
- submission read permission
- note/document visibility if relevant

Before delete:
- tenant check
- edit permission
- submission status
- tab configuration
- uploader/admin policy

Storage paths should include tenant prefix but prefix alone is not security.

---

## 13. Data Source authorization

Lookup query:
- current tenant
- source active
- user allowed to use form/source

Manage:
- admin permission

Never allow cross-org lookup IDs.

---

## 14. Import security

Import must:
- impose max upload size
- parse as data, never execute
- validate schema version
- strip/replace organization ID with current tenant
- reject unsafe external references
- not import secrets/credentials
- create Draft only

---

## 15. Export security

Form definition export:
- manage/export permission

Submission CSV:
- submission read/export permission
- only authorized rows
- only safe/configured fields
- protect against CSV injection where relevant by escaping cells beginning with formula characters

---

## 16. Audit requirements

Audit:
- builder publish/import
- sensitive export
- approval decisions
- file deletion
- permission/role changes if platform handles them

Audit log itself must be tenant scoped except for authorized platform operations.

---

## 17. Security test cases

Mandatory:
1. Org A requests Org B form ID → 404/403 without data leak.
2. Org A requests Org B file ID → denied.
3. Requester calls publish → denied.
4. Non-assigned user approves stage → denied.
5. Approved submission is edited → denied unless explicit process allows.
6. Client sends different organizationId → ignored/rejected.
7. Import contains foreign organizationId → overwritten/rejected.
8. Internal note omitted from requester response.
