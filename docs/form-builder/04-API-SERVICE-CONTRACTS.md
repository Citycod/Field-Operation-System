# 04 — API & Service Contracts v1

**Status:** Draft implementation contract  
**Purpose:** Define generic frontend/backend boundaries without hardcoding business form types.

Use repository-native RPC/server actions/controllers if appropriate. Route examples are conceptual.

---

## 1. Common response model

Recommended success shape:

```json
{
  "data": {},
  "meta": {}
}
```

Recommended error shape:

```json
{
  "error": {
    "code": "FORM_SCHEMA_INVALID",
    "message": "The form contains invalid configuration.",
    "details": []
  }
}
```

Error codes should be stable and machine-readable.

---

## 2. Common concerns

Every protected request:
- authenticated
- organization membership resolved server-side
- permission checked
- tenant scope applied
- input runtime validated
- audit event emitted where important

---

# Forms

## 3. List forms

```text
GET /forms
```

Query:
- search
- status
- page
- pageSize
- sort

Returns:
- form identity
- title
- status
- current versions
- modified date

Permission:
Business Admin or other permitted role.

Tenant:
current organization only.

---

## 4. Create blank form

```text
POST /forms
```

Request:

```json
{
  "title": "Purchase Requisition",
  "description": "Request goods and services"
}
```

Server:
1. derives organization
2. generates key
3. creates logical form
4. creates Draft V1 with minimal valid schema
5. returns form + draft version

---

## 5. Get form

```text
GET /forms/:formId
```

Returns logical form metadata and version pointers.

---

## 6. Get draft schema

```text
GET /forms/:formId/draft
```

Returns active draft version.

---

## 7. Save draft

```text
PUT /forms/:formId/draft
```

Request:
- full schema or controlled patch depending implementation

Server:
- checks manage permission
- validates structure enough to persist Draft
- does not require publish-level completeness
- updates draft version only

Use optimistic concurrency/version token if concurrent editing becomes a concern.

---

## 8. Preview draft

Preview is primarily client-side renderer over Draft schema.

If server validation needed:

```text
POST /forms/:formId/draft/validate
```

Returns:
- errors
- warnings
- passed checks

---

## 9. Publish form

```text
POST /forms/:formId/publish
```

Request:

```json
{
  "changeNote": "Initial release"
}
```

Server transaction:
1. authorize
2. full publish validation
3. block if errors
4. mark Draft version Published or create immutable snapshot
5. set current_published_version_id
6. create next Draft only when edit is requested, not necessarily immediately
7. audit

Response:
published version.

---

## 10. Create new draft from published

```text
POST /forms/:formId/versions/:versionId/create-draft
```

Copies schema into a new version number/state.

Published source remains immutable.

---

# Versions

## 11. List versions

```text
GET /forms/:formId/versions
```

Returns:
- number
- status
- author
- createdAt
- publishedAt
- change note

---

## 12. Get version

```text
GET /forms/:formId/versions/:versionId
```

Authorization required.

---

# Data Sources

## 13. List data sources

```text
GET /data-sources
```

Tenant scoped.

---

## 14. Create data source

```text
POST /data-sources
```

Request includes:
- name
- fields
- displayField
- valueField

---

## 15. Update data source

```text
PUT /data-sources/:id
```

Prevent breaking a published form reference without clear validation/warning.

---

## 16. Data source items

```text
GET    /data-sources/:id/items
POST   /data-sources/:id/items
PUT    /data-sources/:id/items/:itemId
DELETE /data-sources/:id/items/:itemId
```

Support:
- search
- pagination
- active/inactive

Delete may be soft/inactive if referenced historically.

---

## 17. Lookup query

```text
GET /data-sources/:id/lookup?q=...
```

Returns lightweight:
- value
- display
- optional secondary text

Tenant scoped.

---

# Submissions

## 18. Create submission

```text
POST /forms/:formId/submissions
```

Server chooses current Published version.

Request may begin with empty/initial data.

Response:
- submission ID
- version ID
- status=draft
- reference if generated at creation

---

## 19. Save draft submission

```text
PATCH /submissions/:submissionId
```

Allowed only:
- authorized user
- editable status
- correct tenant

Validate:
- schema-compatible values
- do not necessarily enforce all required fields until Submit

---

## 20. Get submission

```text
GET /submissions/:submissionId
```

Returns:
- metadata
- data
- detail rows
- files metadata
- notes according to visibility
- approval runtime summary
- exact form version schema or resolvable version ID

---

## 21. List submissions

```text
GET /forms/:formId/submissions
```

Query:
- search
- filters from configured list view
- sort
- page/pageSize
- status

Server must safely map configured fields to query behavior.

Never concatenate raw client field names into SQL without whitelisting/resolution.

---

## 22. Submit submission

```text
POST /submissions/:submissionId/submit
```

Server:
1. authorize
2. load exact form version
3. validate required fields/rules
4. recompute/verify calculations where critical
5. validate detail rows
6. validate files
7. set submitted status
8. start workflow if configured
9. audit

Transaction required.

---

## 23. Return/resubmit

If returned:
- requester can edit
- `POST /submissions/:id/resubmit`
- server validates again
- workflow cycle semantics follow WorkflowService policy

---

# Detail Rows

## 24. Add detail row

```text
POST /submissions/:id/details/:tabId/rows
```

Request:
row data.

Server validates against exact Details tab definition.

---

## 25. Update detail row

```text
PATCH /submissions/:id/details/:tabId/rows/:rowId
```

Only while editable.

---

## 26. Delete detail row

```text
DELETE /submissions/:id/details/:tabId/rows/:rowId
```

Respect audit/edit status.

---

# Files

## 27. Begin upload

Recommended flow:
- authorize first
- obtain signed upload URL or upload through server
- enforce expected constraints

Conceptual:

```text
POST /submissions/:id/files/upload-intent
```

Request:
- tabId/fieldId/detailRowId context
- fileName
- mime
- size

Response:
- upload token/url

---

## 28. Complete upload

```text
POST /submissions/:id/files/complete
```

Server verifies storage object and creates metadata.

---

## 29. Download file

```text
GET /files/:fileId/download
```

Server:
- tenant check
- permission check
- returns signed short-lived URL or streams file

Never expose permanent public storage URLs for private documents.

---

## 30. Delete file

```text
DELETE /files/:fileId
```

Only if allowed by tab config, status, and permission.

---

# Notes

## 31. Add note

```text
POST /submissions/:id/notes
```

Request:

```json
{
  "tabId": "tab_notes",
  "message": "Reviewed quotation.",
  "visibility": "internal"
}
```

Server:
- validates tab type
- permission
- allowed visibility
- appends note

---

## 32. List notes

Usually included in submission response or:

```text
GET /submissions/:id/notes?tabId=...
```

Apply visibility filtering server-side.

---

# Approval Runtime

## 33. My approval tasks

```text
GET /approvals/tasks
```

Returns pending stage instances assigned/resolvable to current user.

---

## 34. Approve

```text
POST /approval-stages/:stageInstanceId/approve
```

Request:
comment if required.

Transaction:
- verify active stage
- verify actor
- create decision
- complete stage
- activate next stage or finish workflow
- update submission status
- audit

Idempotency protection required to prevent duplicate decision.

---

## 35. Reject

```text
POST /approval-stages/:stageInstanceId/reject
```

Creates immutable decision and sets workflow/submission rejected.

---

## 36. Return

```text
POST /approval-stages/:stageInstanceId/return
```

MVP recommended:
- return to requester
- submission status returned
- requester can edit/resubmit
- history preserved

---

# Import / Export

## 37. Import form

```text
POST /forms/import
```

Input:
JSON file.

Server:
- file size guard
- parse
- schema version check
- runtime schema validation
- semantic validation
- sanitize organization references
- create as Draft in current org

Never import Published.

---

## 38. Export form

```text
GET /forms/:formId/versions/:versionId/export
```

Returns schema definition JSON.

Exclude:
- secrets
- tenant-internal credentials
- runtime submissions

---

## 39. Export submissions CSV

```text
GET /forms/:formId/submissions/export.csv
```

Authorize.
Apply configured/allowed columns.
Escape CSV safely.

---

# Audit

Critical service actions emit audit events:
- create/update/publish form
- import/export
- submit
- approve/reject/return
- file delete
- data-source mutation

---

# Service responsibilities

Recommended:

```text
FormService
FormVersionService
FormValidationService
SubmissionService
DetailRowService
DataSourceService
FileService
NoteService
WorkflowService
ApprovalService
RulesEngine
CalculationEngine
ExportService
AuditService
AuthorizationService
```

Avoid business-form-specific services like `VisitorFormService` inside the generic engine.
