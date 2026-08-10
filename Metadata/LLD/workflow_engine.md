# Workflow Engine (Low Level Design)

## Overview
Executes multi-step workflows with state persistence and failure recovery.

## Responsibilities
-   Executes multi-step workflows
-   Handles retries
-   Graceful failure recovery
-   State persistence

## Database Schema (Relevant parts)
### workflows
-   id
-   tenant_id
-   name
-   state
-   created_at
