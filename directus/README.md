# Directus Backend Infrastructure

This directory contains configuration, snapshots, and extensions for the **Directus** backend API layer.

## Directory Structure

```text
directus/
├── extensions/    # Custom Directus extensions, hooks, and custom API endpoints
├── snapshots/     # Data model snapshots exported via Directus CLI
└── README.md
```

## Schema Snapshots & Migration Workflow

Directus manages data model changes via schema snapshots:

1. **Export current schema:**
   ```bash
   npx directus schema snapshot ./snapshots/schema-latest.yaml
   ```

2. **Apply schema to an environment:**
   ```bash
   npx directus schema apply ./snapshots/schema-latest.yaml
   ```

## Pre-planned System Collections

- `organizations`: Multi-tenant organization records.
- `organization_memberships`: Maps `directus_users` to `organizations` with roles.
