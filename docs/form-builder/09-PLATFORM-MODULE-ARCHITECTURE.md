# 09 — Platform Module Architecture

## Purpose

This document defines the relationship between the Form Builder and the Field Workforce & Operations Management Platform.

## Classification

The Form Builder is a platform module.

It is not an independent product.

## Ownership Boundary

Platform owns:

- Authentication
- Users
- Organizations
- Tenancy
- Roles
- Global permissions
- Navigation
- Shared storage
- Notifications
- Audit infrastructure

Form Builder owns:

- Form definitions
- Form versions
- Builder UI
- Schema validation
- Runtime rendering
- Configurable tabs
- Rules
- Calculations
- Form submissions
- Configured approval workflows

## Module Flow

```text
Platform User
      |
      v
Platform Authentication
      |
      v
Organization Context
      |
      v
Form Builder Module
      |
      v
Configured Business Form
      |
      v
Submission + Workflow
```

## Future Modules Using Form Builder

- Procurement
- Visitor Management
- HSE
- Asset Management
- Job Reports
- Expenses
- Custom operational processes

## Engineering Rule

Never solve a single module problem by adding business-specific code into the Form Builder engine.

Prefer:

```text
Generic capability
+
Configuration
=
New business process
```

over:

```text
New business process
+
Custom hardcoded logic
```
