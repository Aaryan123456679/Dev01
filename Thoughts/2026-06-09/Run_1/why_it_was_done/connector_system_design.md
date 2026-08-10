# Universal Connector System Design

## Core Insight
Every REST API has a discoverable structure: a base URL, an auth mechanism, required credentials, and a set of common operations. This structure is predictable enough for an LLM to generate it from a product name alone. Rather than writing a custom connector per service (Notion, Kaggle, Slack, ...), one `GenericRestConnector` handles all of them once `ConnectorDiscoveryService` produces the definition.

## Why LLM-powered discovery, not a static registry
A static registry needs updating every time a new API is added and goes stale as APIs evolve. LLM-generated definitions are cached in `connector_registry` after first discovery — so the latency cost is paid once, not on every connection.

## Credential validation design
Test endpoint validation is best-effort: 401 is a hard fail (definitely wrong token), but 404 and 5xx are soft fails (endpoint exists but the particular operation may not). This avoids blocking legitimate connections when the test endpoint is wrong in the LLM-generated definition — the user can still connect and verify manually.

## Why not one encrypted blob for all credentials
Storing each credential individually (encrypted separately) means future rotation of a single key (e.g., refreshing an OAuth token) doesn't require re-encrypting the entire credential set. It also makes audit logging cleaner — you can log "rotated kaggle_username" without touching "kaggle_api_key".

## Tradeoff
The `GenericRestConnector` only supports `rawRequest()` and does not understand the semantic meaning of any API's response. The LLM still must interpret what came back. This means complex multi-step API workflows (paginate, deduplicate, join) require the LLM to orchestrate multiple raw calls, which is slower and more prone to error than a purpose-built SDK.
