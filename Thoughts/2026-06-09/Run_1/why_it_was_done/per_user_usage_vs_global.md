# Per-User Usage Tracking Instead of Global Counter

## Decision
Changed LLM usage tracking from a single global counter per model to per-user counters keyed by `userId`.

## Why
The original system had one `.usage.json` file with `{ [modelId]: count }`. This meant one user hitting the daily limit would block all other users from that model. Since Gemini provides a per-project quota (not per-account), it's more accurate to say "each user gets their own slice" — especially at low user counts.

## Tradeoff
The counter is now file-based with `{ date, users: { [userId]: { [modelId]: count } } }`. This is not safe for horizontal scaling — two replicas would overwrite each other's write. Accepted for now; migration to a DB table is item #9 in production hardening.

## Alternative Considered
Redis-based atomic increment. Rejected because it adds infra complexity for a single-replica dev deployment. The file approach survives backend restarts (persists to disk) which Redis without persistence would not.
