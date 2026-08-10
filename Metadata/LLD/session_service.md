# Session Service (Low Level Design)

## Overview
Manages user sessions, token generation, and expiration.

## Responsibilities
-   Generates signed tokens
-   Maintains expiration
-   Links to user & tenant

## Database Schema (Relevant parts)
### sessions
-   id
-   user_id
-   token
-   expires_at
