# 01 — Form Builder MVP UI/UX Specification

**Status:** Approved design direction  
**Purpose:** Prevent UI drift and define the expected behavior of all MVP screens.

---

## 1. Visual direction

Use a Microsoft Dynamics-inspired enterprise UI.

Characteristics:
- white/light-gray surfaces
- green accent
- compact controls
- strong table/grid treatment
- dense but readable
- restrained cards
- consistent command bars
- subtle borders
- minimal heavy shadows
- operational, not marketing-style

Do not drift into:
- large gradient hero areas
- oversized rounded cards
- colorful generic SaaS dashboard styling
- excessive empty space

---

## 2. Locked builder shell

Top-level builder navigation:

```text
Design | Form Settings | Workflow | Rules | List View | Versions
```

The application shell, command bar, typography, spacing, and navigation remain consistent across builder screens.

Only the workspace changes.

---

## 3. Design workspace hierarchy

```text
Design
├── Header
└── Tabs
    ├── Form / Fields
    ├── Details / Grid
    ├── Notes
    └── Documents
```

Notes/Documents must not become top-level builder pages.

---

## 4. Main builder anatomy

Desktop-first builder:

```text
┌───────────────────────────────────────────────────────────────┐
│ App shell / command bar                                      │
├──────────────┬────────────────────────────┬───────────────────┤
│ Components   │ Canvas                     │ Properties        │
│              │                            │                   │
│ Fields       │ Header                     │ Selected item     │
│ Structure    │ Tabs                       │ configuration     │
│              │ Active tab content         │                   │
└──────────────┴────────────────────────────┴───────────────────┘
```

Recommended:
- component palette: ~220–260px
- properties panel: ~300–360px
- canvas: remaining width

---

## 5. Screen inventory and flow

### Screen 1 — Form Library

Purpose:
- view forms in organization
- search/filter
- see Draft/Published status
- open form
- create form
- import form
- access actions

Primary actions:
- Create Form
- Import
- Open/Edit
- Export
- Archive if supported

States:
- loading
- no forms
- no search results
- permission denied
- error

Next:
- Create New Form
- Builder
- Import flow

---

### Screen 2 — Create New Form

Purpose:
Create a blank form shell.

Fields:
- Form Name / Title
- internal key (auto-generated; editable only if safe)
- description
- category/module if required by current platform
- optional initial header layout

Primary action:
- Create Form

Result:
- draft Form + Draft Version
- redirect to Builder / Design

No template selection.

---

### Screen 3 — Main Form Builder / Design

Purpose:
Primary form construction workspace.

Contains:
- component palette
- header canvas
- tab bar
- active tab content
- properties panel
- Save Draft
- Preview
- Publish

Tab bar:
- horizontal
- `+` add tab
- reorder
- overflow when tabs exceed width
- no arbitrary count restriction

---

### Screen 4 — Add Tab

Opened from:
`+` beside tab bar.

Fields:
- tab name
- tab type
- optional icon
- order/position
- visibility settings where applicable

Types:
- Form / Fields
- Details / Grid
- Notes
- Documents

Result:
- tab added to schema
- automatically becomes selected

---

### Screen 5 — Header Configuration

Purpose:
Build the main information area above tabs.

Supports:
- 1–4 column controlled layout
- multiple sections
- rename section
- reorder
- resize in grid units
- add/reorder fields
- section visibility
- preview

Do not use freeform absolute positioning.

---

### Screen 6 — Details/Grid Tab Configuration

Purpose:
Configure repeating child rows.

Supports:
- tab name
- columns
- column types
- add/edit/delete row behavior
- validation
- calculations
- lookups
- row attachment support
- column order
- optional line-details area if schema supports it

Runtime:
business-grid experience similar to Dynamics line items.

---

### Screen 7 — Form/Fields Tab Configuration

Purpose:
Configure standard non-repeating content inside a tab.

Supports:
- sections
- 1–4 column controlled layout
- fields
- reorder
- validation
- conditional visibility
- permissions if required

Use cases:
- General
- Vendor
- Shipping
- Justification

---

### Screen 8 — Notes Tab Configuration

Purpose:
Configure append-only note/history tab.

Settings:
- name
- description/help
- append-only
- show author
- show timestamp
- allow attachment
- visibility
- who can view
- who can add
- approval-stage association if used

Runtime:
timeline/history, not overwriteable textarea.

---

### Screen 9 — Documents/Attachments Tab Configuration

Purpose:
Configure generic documents tab.

Settings:
- name
- allowed extensions/MIME
- max file size
- max files
- multiple files
- required/optional
- upload/delete permissions
- help text

No hardcoded document categories.

---

### Screen 10 — Rules / Conditions

Purpose:
Define declarative behavior.

Layout:
- rule list
- condition/action editor
- available fields/targets

MVP actions:
- show
- hide
- require
- enable
- disable
- set value if supported

MVP conditions:
- equals
- not equals
- greater/less than
- contains
- empty/not empty

No JS editor.

---

### Screen 11 — Workflow / Approval Configuration

Purpose:
Configure sequential approval.

Supports:
- add stage
- reorder stage
- stage name
- approver source
- comment required
- action behavior
- workflow preview

Runtime actions:
- Approve
- Reject
- Return

---

### Screen 12 — Data Sources / Lookups

Purpose:
Manage reusable lookup data.

Supports:
- create source
- source fields
- display field
- stored value
- add/edit data items
- search
- enable/disable source

Examples:
Employees, Departments, Vendors, Products.

External connectors are not required for MVP unless already present.

---

### Screen 13 — List View Configuration

Purpose:
Configure runtime submission table.

Supports:
- choose columns
- order
- labels
- width
- searchable
- sortable
- filterable
- formatting
- default sort
- preview

Columns are derived from form schema/system fields.

---

### Screen 14 — Versions

Purpose:
Show draft/published history.

Supports:
- version number
- status
- author
- timestamp
- change note
- current Draft
- current Published
- duplicate published as new draft
- restore only through safe new-draft semantics

Never silently mutate Published.

---

### Screen 15 — Form Settings

Purpose:
Form-level settings.

May include:
- title/description
- drafts allowed
- numbering/reference format
- basic permissions
- basic notifications
- general appearance settings approved for MVP

Keep this screen focused.

---

### Screen 16 — Preview

Purpose:
Test current Draft schema without publishing.

Supports:
- desktop/tablet/mobile preview if implemented
- interactive values
- rules
- validation
- grids
- notes/documents behavior as preview-safe
- no real production submission unless explicitly in test mode

---

### Screen 17 — Published Runtime Form

Purpose:
Actual user-facing form.

Must render:
- header
- configured tabs
- fields
- details grids
- notes
- documents
- rule behavior
- validation
- Save Draft if allowed
- Submit

No builder controls.

---

### Screen 18 — Submission List

Purpose:
Runtime list of real submitted records.

Supports:
- search
- filters
- sort
- pagination
- status
- create new
- open
- export if authorized

Generated from List View configuration.

---

### Screen 19 — Submission Record View

Purpose:
Read/review one submission.

Shows:
- record reference
- status
- header
- tabs
- detail rows
- documents
- notes
- workflow progress
- history

Actions depend on role/status.

---

### Screen 20 — Approver Review View

Purpose:
Focused approval task.

Shows:
- submission
- current stage
- prior decisions
- due/context information
- documents/notes/details

Actions:
- Approve
- Reject
- Return
- comment

Only authorized approver can act.

---

### Screen 21 — Import / Export

Import:
- upload form-definition JSON
- parse
- validate
- show errors/warnings
- create Draft only

Export:
- export definition
- export submission CSV separately where authorized

---

### Screen 22 — Publish Validation / Confirmation

Purpose:
Final gate before Published version.

Shows:
- errors
- warnings
- passed checks
- version summary
- publish action

Errors block publish.
Warnings do not necessarily block publish.

---

## 6. Runtime responsive behavior

Builder:
- desktop-first

Published Runtime:
- responsive/mobile-ready

Record View:
- responsive

Submission List:
- responsive table/list adaptation

---

## 7. Interaction rules

- selecting component opens properties
- property edits update preview/canvas immediately
- drag/reorder updates schema order
- destructive actions require confirmation
- unsaved state visible
- errors are actionable
- tabs overflow gracefully rather than compressing unreadably
- no invisible implicit saves unless clearly communicated

---

## 8. UI states

Every major screen must design/implement:
- loading
- empty
- error
- no permission
- no search results
- saving
- saved
- unsaved changes
- validation errors

---

## 9. Screenshot storage

Approved screenshots should be stored under:

```text
docs/form-builder/ui/
```

Use stable filenames such as:

```text
01-form-library.png
02-create-form.png
03-main-builder.png
...
22-publish-validation.png
```

Do not replace approved screenshots silently. If a screen is revised, keep the old one archived or update the Decisions Log.
