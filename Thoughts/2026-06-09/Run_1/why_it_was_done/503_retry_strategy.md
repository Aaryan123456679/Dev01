# 503 Auto-Retry Strategy

## Decision
Retry transient Gemini errors (503 Service Unavailable, "model overloaded") up to 3 times with 2s / 4s / 6s linear backoff. Quota errors (429, `resource_exhausted`) are not retried — they will fail on every attempt until the quota resets.

## Why this backoff
The retry window (6 + 4 + 2 = 12s total wait) keeps the user experience acceptable. Exponential backoff (e.g., 1s / 2s / 4s) is common but the Gemini 503s tend to be short-lived overloads, not systemic outages, so a linear increase is gentler on quota use.

## Why not retry quota errors
A 429 will stay a 429 until midnight. Retrying wastes the request and burns quota unnecessarily. Fail fast, surface a clear "Quota exceeded" error to the user.

## Tradeoff
If a 503 persists for longer than ~12 seconds (e.g., a longer regional outage), the user still sees an error. We could increase retries or add a longer sleep, but that degrades UX for the much more common case of short transient overloads.
