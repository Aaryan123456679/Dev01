# API Gateway (Low Level Design)

## Overview
The entry point for all external requests (WebUI).

## Responsibilities
-   Auth validation
-   Role validation
-   Tenant scoping
-   Rate limiting
-   Routing to internal services

## Interaction
Communicates with WebUI. Routes to internal services via MCP abstraction or direct service calls (Auth, Session, etc).
