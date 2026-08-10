import { z } from 'zod'

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  tool: z.string(),
  input: z.unknown(),
})

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  steps: z.array(WorkflowStepSchema),
})

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>
export type WorkflowStepDef = z.infer<typeof WorkflowStepSchema>

// ── SSE event types streamed to client ────────────────────────────────────────

export type WorkflowEvent =
  | { type: 'workflow.started';   workflowId: string }
  | { type: 'step.started';       stepId: string; stepName: string; tool: string }
  | { type: 'step.output';        stepId: string; chunk: string }
  | { type: 'step.completed';     stepId: string; result: unknown }
  | { type: 'step.failed';        stepId: string; error: string; willRetry: boolean }
  | { type: 'workflow.completed'; workflowId: string; result: unknown }
  | { type: 'workflow.failed';    workflowId: string; error: string }
  | { type: 'workflow.cancelled'; workflowId: string }
