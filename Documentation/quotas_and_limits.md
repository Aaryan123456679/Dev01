# Quotas and Limits

## Sandbox Quotas (per role)

| Role | Max Concurrent Sandboxes | Timeout | Memory |
|---|---|---|---|
| admin | 8 | 300s | 512MB |
| power | 4 | 120s | 256MB |
| standard | 1 | 30s | 128MB |
| readonly | 0 (blocked) | — | — |

Enforced in `SandboxManager.allocate()`. `readonly` users cannot create sandboxes at all.

---

## LLM Daily Limits (per user)

Each user gets their own independent counter. Counters reset at **UTC midnight**. One user exhausting their quota does not affect other users.

| Model | Daily Limit | Quality Tier |
|---|---|---|
| `gemini-flash-lite-latest` | 1000 requests | Low |
| `gemini-2.5-flash-lite` | 1000 requests | Medium |
| `gemini-flash-latest` | 250 requests | High |
| `gemini-2.5-flash` | 20 requests | Extra-High |

Usage is tracked in `Code/backend/.usage.json`. When a user hits their limit, the backend returns a `429 Quota exceeded` error. The UI displays this as a collapsed error labeled **Quota exceeded**.

> **Note for production**: The `.usage.json` file is not safe for multi-replica deployments. Migrate to a DB-backed counter before running more than one backend instance.

---

## Storage Limits

| Resource | Limit |
|---|---|
| Max upload size | 50 MB |
| Max download size | 100 MB |
| Signed URL TTL | 15 minutes |

---

## Rate Limiting

In-memory token bucket (single-instance safe only). Default: 100 requests/minute per user. Replace with Redis for multi-replica deployments.

---

## Connector Limits (quality settings)

Configurable per user in Settings → Quality:
- **Max connector instances**: 1–10 (default 3)
- **Max sandboxing instances**: 1–8 (default 2)

These are UI-side preference values; backend enforcement via role quotas applies independently.
