# 07 — Testing & MVP Acceptance Specification

**Status:** Required  
**Purpose:** Define how engineering proves correctness and when the MVP is complete.

---

## 1. Testing layers

Required:
- unit
- integration
- end-to-end
- tenant/security regression
- manual UX review against approved screens

---

# Unit tests

## 2. Schema validation

Test:
- valid minimal schema
- all field types
- all tab types
- duplicate field IDs
- duplicate keys
- invalid tab type
- malformed lookup
- broken rule ref
- broken calculation ref
- invalid workflow stage
- invalid list column ref

---

## 3. Rules engine

Test every operator:
- equals
- notEquals
- greaterThan
- lessThan
- contains
- isEmpty
- isNotEmpty

Test every action:
- show
- hide
- require
- enable
- disable
- setValue if shipped

Test:
- `match=all`
- `match=any`
- missing values
- type mismatch behavior

---

## 4. Calculations

Test:
- add/subtract/multiply/divide
- sum
- empty rows
- decimal currency
- divide by zero handling
- invalid refs
- server/client consistency

---

## 5. Version transitions

Test:
- create Draft V1
- publish V1
- cannot mutate V1
- create Draft V2
- publish V2
- historical V1 unchanged

---

# Integration tests

## 6. Forms

- create blank form
- save draft
- preview validation
- publish
- create next draft
- list versions

---

## 7. Data Sources

- create
- add fields
- add items
- lookup search
- tenant isolation
- inactive item behavior

---

## 8. Submissions

- create Draft
- save data
- required fields not enforced until Submit where configured
- Submit validates exact version
- published schema changes do not affect old submission version

---

## 9. Detail rows

- add
- edit
- delete
- validation
- calculations
- tenant boundary
- attachments linked to correct row

---

## 10. Files

- allowed file accepted
- disallowed file rejected
- oversize rejected
- unauthorized download denied
- cross-tenant denied
- delete permission checked

---

## 11. Notes

- append note
- previous note preserved
- visibility filtering
- unauthorized internal note hidden
- approval-stage linkage

---

## 12. Workflow

- workflow starts on submit
- first stage active
- next stage only after approval
- reject terminal
- return behavior correct
- wrong approver denied
- double decision prevented

---

# E2E scenarios

## 13. Builder happy path

```text
Login Business Admin
→ Form Library
→ Create Blank Form
→ Add Header fields
→ Add Form tab
→ Add Details tab
→ Add Notes tab
→ Add Documents tab
→ Save Draft
→ Preview
→ Publish
```

Expected:
Published version created.

---

## 14. Runtime submission

```text
Open Published Form
→ enter header values
→ add detail rows
→ upload file
→ save Draft
→ reopen Draft
→ submit
```

Expected:
- values persist
- details persist
- file persists
- status transitions
- approval starts if configured

---

## 15. Approval

```text
Approver opens assigned task
→ reviews record
→ adds comment
→ approves
```

Expected:
- immutable decision
- next stage active
- timeline updated

Repeat until Approved.

---

## 16. Reject

Expected:
- active stage decision recorded
- submission rejected
- no further stage becomes active

---

## 17. Return

Expected MVP:
- returned to requester
- history preserved
- requester can edit
- resubmit creates/reset cycle according to implementation policy

---

## 18. Version history

```text
Publish V1
→ create submission on V1
→ create Draft V2
→ modify fields
→ publish V2
→ open V1 submission
```

Expected:
V1 submission renders correctly using V1.

---

## 19. Tenant isolation

Mandatory E2E/integration tests:

Org A cannot:
- GET Org B form
- GET Org B submission
- download Org B file
- query Org B data source
- decide Org B approval
- export Org B records

No response should leak sensitive metadata.

---

## 20. Import

Test:
- valid V1 import → Draft
- malformed JSON → rejected
- unsupported schema version → rejected
- foreign organization ID → ignored/replaced
- broken references → rejected
- oversized file → rejected

---

## 21. Export

Test:
- form definition excludes submissions
- definition excludes secrets
- CSV only includes authorized rows
- CSV escapes formula injection patterns where needed

---

# UX acceptance

## 22. Screen consistency

Check:
- same app shell
- same builder nav
- Notes/Documents only inside Design
- approved green/white enterprise direction
- no blue/generic old design regression
- table density consistent
- action placement consistent

---

## 23. State coverage

For every major screen:
- loading
- empty
- error
- no permission
- no results
- saving
- unsaved changes
- validation errors

---

# Performance baseline

## 24. Basic performance

MVP should remain usable with:
- dozens of fields
- multiple tabs
- several details grids
- hundreds/thousands of submissions in paginated list
- moderate data-source lookup sizes with server pagination/search

Do not prematurely optimize for millions of records in UI.

---

# Accessibility acceptance

## 25. Minimum

- keyboard-accessible controls
- visible focus
- labels
- dialog focus trap
- accessible tab semantics
- error text
- sufficient contrast
- tooltips/aria labels for icon-only buttons

---

# Final MVP acceptance

## 26. Visitor App proof

The final validation is building Visitor App using the builder.

Must be possible to configure:
- visitor header information
- host lookup
- conditional fields if required
- additional visitor/detail rows if required
- notes
- documents
- approval
- list view
- record view

Pass:

No Visitor-specific logic is added to core engine.

---

# Definition of done

MVP is done when:
- all approved scope implemented
- acceptance E2Es pass
- cross-tenant tests pass
- published versions immutable
- approval works
- files secured
- UI follows approved hierarchy
- Visitor App validation succeeds
