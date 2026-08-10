import { randomUUID } from 'node:crypto'
import { WorkflowRepo } from '../../repositories/workflow.repo'
import { mcpRegistry } from '../mcp/registry'
import type { MCPContext } from '../mcp/types'
import type { WorkflowDefinition, WorkflowEvent } from '../../types/workflow'
import type { ContextSnapshot } from '../../types/context'
import type { DbWorkflowStep } from '../../types/common'

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 500

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Some failures will never succeed on retry within the workflow's lifetime —
// notably daily/per-minute quota exhaustion (HTTP 429 / RESOURCE_EXHAUSTED).
// Retrying these just burns more quota, so fail fast instead.
function isNonRetryable(err: Error): boolean {
  const m = err.message.toLowerCase()
  return (
    m.includes('429') ||
    m.includes('too many requests') ||
    m.includes('resource_exhausted') ||
    m.includes('quota')
  )
}

export class WorkflowEngine {
  private repo = new WorkflowRepo()

  async *execute(
    definition: WorkflowDefinition,
    snapshot: ContextSnapshot,
    sandboxId: string | undefined,
    tenantId: string,
    userId: string,
    conversationId?: string,
  ): AsyncGenerator<WorkflowEvent> {
    // Persist workflow record
    const workflow = await this.repo.create({
      tenant_id: tenantId,
      user_id: userId,
      conversation_id: conversationId ?? null,
      name: definition.name,
      state: 'running',
      steps: [],
      context_snapshot: snapshot,
      result: null,
      error: null,
      retry_count: 0,
    })

    yield { type: 'workflow.started', workflowId: workflow.id }

    const mcpCtx: MCPContext = { tenantId, userId, role: 'standard', sandboxId }
    const completedSteps: DbWorkflowStep[] = []
    let finalResult: unknown = null

    try {
      for (const stepDef of definition.steps) {
        const stepId = randomUUID()
        yield { type: 'step.started', stepId, stepName: stepDef.name, tool: stepDef.tool }

        const dbStep: DbWorkflowStep = {
          id: stepId,
          name: stepDef.name,
          tool: stepDef.tool,
          input: stepDef.input,
          state: 'running',
          retry_count: 0,
          started_at: new Date().toISOString(),
        }

        let result: unknown
        let lastError: Error | undefined

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await mcpRegistry.execute(stepDef.tool, stepDef.input, mcpCtx)
            break
          } catch (err) {
            lastError = err as Error
            const willRetry = attempt < MAX_RETRIES && !isNonRetryable(lastError)
            yield {
              type: 'step.failed',
              stepId,
              error: lastError.message,
              willRetry,
            }

            if (!willRetry) break
            dbStep.retry_count = attempt + 1
            await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt))
          }
        }

        if (lastError && result === undefined) {
          // Step permanently failed
          dbStep.state = 'failed'
          dbStep.error = lastError.message
          dbStep.completed_at = new Date().toISOString()
          completedSteps.push(dbStep)
          await this.repo.updateStep(workflow.id, completedSteps)
          await this.repo.updateState(workflow.id, 'failed', { error: lastError.message })
          yield { type: 'workflow.failed', workflowId: workflow.id, error: lastError.message }
          return
        }

        dbStep.state = 'completed'
        dbStep.output = result
        dbStep.completed_at = new Date().toISOString()
        completedSteps.push(dbStep)
        finalResult = result

        await this.repo.updateStep(workflow.id, completedSteps)
        yield { type: 'step.completed', stepId, result }

        // Stream any text output from LLM steps
        if (result && typeof result === 'object' && 'content' in (result as object)) {
          const content = (result as { content: string }).content
          if (typeof content === 'string') {
            yield { type: 'step.output', stepId, chunk: content }
          }
        }
      }

      await this.repo.updateState(workflow.id, 'completed', { result: finalResult })
      yield { type: 'workflow.completed', workflowId: workflow.id, result: finalResult }
    } catch (err) {
      const message = (err as Error).message
      await this.repo.updateState(workflow.id, 'failed', { error: message })
      yield { type: 'workflow.failed', workflowId: workflow.id, error: message }
    }
  }
}

export const workflowEngine = new WorkflowEngine()
