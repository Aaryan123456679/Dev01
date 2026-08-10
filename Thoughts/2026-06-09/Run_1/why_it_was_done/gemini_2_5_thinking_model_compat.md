# Gemini 2.5 Thinking Model Compatibility Decisions

## Decision 1: Omit thinkingConfig for 2.5 models
`thinkingBudget: 0` is rejected by the Gemini 2.5 API with a validation error. The fix is to detect thinking models by `modelId.includes('2.5')` and conditionally omit `thinkingConfig` entirely. Setting budget ≥ 1 works but wastes tokens/quota on lightweight requests; omitting the field lets the model decide.

## Decision 2: Filter thought parts from response
Gemini 2.5 returns internal reasoning as separate `Part` objects with `thought: true`. If these are concatenated into the assistant response text, the user sees reasoning tokens not meant for display — or gets an empty reply if the model put all content in thought parts. Filter: `if (part.thought === true) continue`.

## Why not use a separate thinking-mode endpoint
No separate endpoint exists in the current `@google/generative-ai` SDK. The same `generateContent` call returns both thinking and text parts; filtering is the right approach.

## Tradeoff
The `thought: true` check requires a double-cast (`part as unknown as Record<string, unknown>`) because the TypeScript SDK's `Part` type does not expose this field. This is a fragile spot — if Google renames the field in a future SDK release, thought tokens will silently leak into responses.
