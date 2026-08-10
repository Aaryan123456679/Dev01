# MCP-Driven Multi-Tenant Execution & Sandbox Platform: High Level Design

## 1. Architectural Overview

This platform is a modular, multi-tenant execution system that enables:
- AI-assisted workflows
- Secure sandboxed code execution
- Media pipelines
- Download management
- File storage & sharing
- MCP-based service abstraction

### Core Layers
1.  WebUI Layer
2.  API Gateway Layer
3.  Auth & Session Layer
4.  Agent & Workflow Engine
5.  MCP Abstraction Layer
6.  Sandbox Execution Layer
7.  Context & Storage Layer
8.  Media & Download Subsystems
9.  Observability & Safety Layer

## 2. Core Design Principles
-   Sandboxes are stateless executors
-   Context is persistent and external
-   All services wrapped behind MCP
-   Strict multi-tenancy
-   Strong isolation (no cross-tenant access)
-   Pluggable providers (open-source ↔ paid)
-   Clear separation of responsibilities

## 3. Component Architecture

### 3.1 WebUI
Supports:
- Text input
- File upload (recursive validation)
- Terminal streaming
- Mic & camera session-based access
- Intent-based commands

Communicates only with API Gateway.

### 3.2 API Gateway
Responsibilities:
- Auth validation
- Role validation
- Tenant scoping
- Rate limiting
- Routing to internal services

### 3.3 Auth & RBAC

Authentication is delegated entirely to **Clerk** (hosted identity provider). The backend verifies Clerk JWTs locally on every request — no session store, no password management. On first sign-in, a tenant and user row are automatically provisioned (lazy provisioning).

Roles: Admin, Power, Standard, Read-Only
Each role defines: Sandbox quota, Execution time, Memory limits, GPU access, Tool availability

### 3.4 Context Model
Persistent components:
-   User Context
-   Tenant Context
-   Conversation History
-   Workflow State
-   Artifact References

Stored in: PostgreSQL (structured state), Redis (ephemeral state), Object Storage (artifacts)

### 3.5 Sandbox Types
1.  Ephemeral Task Sandbox: One per execution step, Auto-destroy
2.  Dedicated Lease Sandbox: Time-boxed, Terminal access, Snapshot support

Isolation via: Docker / Firecracker, cgroups, seccomp, network namespaces

### 3.6 MCP Layer
All services abstracted behind MCP interfaces.
Categories: LLM, Vision, Speech, OCR, Embeddings, Storage, Sandbox, Media, Downloads
MCP Responsibilities: Provider discovery, Capability scoping, Version control, Swapping providers

### 3.7 Agent & Workflow Engine
Execution Flow:
1.  Intent resolution
2.  Workflow selection
3.  Context snapshot build
4.  MCP tool resolution
5.  Sandbox allocation
6.  Execution
7.  Artifact extraction
8.  Context update
9.  Sandbox teardown

### 3.8 Observability
-   Per-sandbox logs
-   Resource metrics
-   Audit trails
-   Abuse detection
-   Auto teardown on violation
