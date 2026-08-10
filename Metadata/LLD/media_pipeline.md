# Media Pipeline (Low Level Design)

## Overview
Handles media processing, ingestion, and metadata.

## Responsibilities
-   Ingest media
-   Metadata refresh
-   Transcoding (optional)
-   Integration with Jellyfin
-   **No code execution allowed** within the media pipeline.

## Storage
Files stored in `/tenants/{tenant_id}/media/`.
