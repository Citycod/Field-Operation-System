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

## Infrastructure Boundaries & Portability

The Form Builder module consumes platform capabilities via provider-neutral interfaces:

- **Storage**: Files are uploaded/managed via `StorageService` using key format `{organization_id}/{module}/{entity_id}/{uuid}-{filename}`. No bucket names or provider SDKs are exposed to the module.
- **Auth & Identity**: User identity is derived from authenticated session context (`AuthService`, `assertTenantAccessFromSession`). No client-provided `userId` parameters are trusted for server operations.
- **Form Engine Isolation**: `packages/form-engine` remains pure domain logic with 0 dependencies on external BaaS SDKs.

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
