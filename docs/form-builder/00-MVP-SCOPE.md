# 00 — Form Builder MVP Scope

**Status:** Approved  
**Audience:** Product, engineering, Codex  
**Purpose:** Define exactly what is and is not part of the first MVP.

---

## 1. Objective

Build a custom Form Builder that allows a Business Admin to create and manage professional business forms from scratch without custom development for each form.

The builder is a module inside the wider Field Workforce & Operations Management Platform.

The MVP must prove the engine, not every future platform module.

---

## 2. Primary user

### Business Admin

Can:
- create blank forms
- configure header
- add fields
- add tabs
- configure tab types
- create/manage data sources
- configure rules
- configure calculations
- configure approvals
- configure list view
- preview
- publish
- review versions
- import/export definitions
- view permitted submissions

### Runtime user / requester

Can:
- open published form
- complete fields
- add detail rows
- upload documents where configured
- add notes where permitted
- save draft where enabled
- submit
- view permitted submissions

### Approver

Can:
- see submissions assigned to them
- review record
- inspect notes/documents/details
- add approval comment
- approve/reject/return

---

## 3. Approved creation model

There are no templates in the first MVP.

Main flow:

```text
Form Library
→ Create Form
→ Start Blank
→ Builder
→ Preview
→ Publish
```

Importing a form definition is supported separately.

---

## 4. Approved form structure

A form contains:

```text
Header
  - configurable sections/columns/fields

Tabs
  - unlimited configurable tabs
```

Supported MVP tab types:

```text
Form / Fields
Details / Grid
Notes
Documents
```

Names are not hardcoded.

Examples:

```text
Items → Details
Materials → Details
Vendor → Form
Shipping → Form
Manager Comments → Notes
Supporting Evidence → Documents
```

---

## 5. Core MVP requirements

### Form management
- form library
- create blank form
- draft state
- preview
- publish
- archive support if already present or easy to include
- version history
- import/export definition

### Header
- 1–4 column controlled layout
- multiple sections
- rename section
- reorder section
- add/remove/reorder fields
- responsive runtime behavior

### Fields
Initial types:
- text
- textarea
- number
- currency
- date
- dropdown
- checkbox
- lookup
- file
- calculated

### Details/Grid
- multiple detail tabs allowed
- configurable columns
- row add/edit/delete
- row validation
- lookup columns
- calculation columns
- row attachment support where configured
- stable row identity

### Notes
- append-only history
- author
- timestamp
- visibility
- optional attachment
- optional approval-stage relationship

### Documents
- multiple files
- allowed types
- max size
- max count
- required/optional
- metadata
- object storage

### Data Sources
Examples:
- Employees
- Departments
- Customers
- Vendors
- Products
- Sites
- Assets
- Projects
- Cost Centres

### Rules
MVP:
- show
- hide
- require
- enable/disable
- set value if implemented safely

Operators:
- equals
- not equals
- greater/less than
- contains
- empty/not empty

### Calculations
MVP:
- add
- subtract
- multiply
- divide
- sum
- min/max/count where needed

### Approval
- sequential stages
- specific user or resolvable role-based approver
- approve
- reject
- return
- approval comments
- history

### List View
- configurable columns
- search
- filter
- sort
- pagination
- status display
- open record
- create new
- export if permitted

### Runtime
- published form
- draft submission
- submit
- record view
- approval review

### Multi-tenancy
- strict organization isolation
- server-side enforcement

---

## 6. Explicitly out of scope

Not in MVP:
- template gallery
- platform templates
- industry templates
- AI assistant
- offline sync
- payments
- QR enhancements
- parallel approval
- workflow canvas/BPMN
- delegation/escalation engine
- native mobile app
- template marketplace
- advanced reporting
- arbitrary JS
- advanced external integration framework

---

## 7. Visitor App validation

The Visitor App is built after the builder MVP.

Pass condition:

> The Visitor App can be configured through the Form Builder without adding Visitor-specific code to the core engine.

If a capability is missing, engineering must determine whether it is generic before adding it to the engine.

---

## 8. MVP acceptance flow

```text
Create Blank Form
→ Configure Header
→ Add Fields
→ Add Details Tab
→ Add Documents Tab
→ Add Notes Tab
→ Configure Lookups
→ Configure Rules
→ Configure Calculations
→ Configure Approval
→ Configure List View
→ Preview
→ Publish
→ Create Submission
→ View Submission
→ Approve/Reject/Return
```

The MVP is not complete until this works end-to-end.
