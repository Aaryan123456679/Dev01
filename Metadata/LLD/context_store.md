# Context Store (Low Level Design)

## Overview
Manages persistent context for users, tenants, conversations, and workflows. Note that Sandboxes are stateless, so context must be injected.

## Responsibilities
- Build snapshot
- Inject into sandbox
- Update workflow state
- Store artifact references

## Data Model
Persistent components:
-   User Context
-   Tenant Context
-   Conversation History
-   Workflow State
-   Artifact References

Stored in:
- PostgreSQL (structured state)
- Redis (ephemeral state)
- Object Storage (artifacts)
