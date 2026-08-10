import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { agentOrchestrator } from '../lib/agents/orchestrator'
import { ConversationRepo } from '../repositories/conversation.repo'
import { ExecuteRequestSchema } from '../types/execute'
import { requireStandard } from '../middleware/rbac'
import { rateLimitMiddleware } from '../middleware/ratelimit'
import type { HonoEnv } from '../types/common'

export const executeRouter = new Hono<HonoEnv>()
const conversationRepo = new ConversationRepo()

executeRouter.post(
  '/',
  requireStandard(),
  rateLimitMiddleware,
  zValidator('json', ExecuteRequestSchema),
  async (c) => {
    const { tenantId, userId, role } = c.get('tenantCtx')
    const { prompt, conversationId: reqConvId, stream, attachmentIds, forceCodeExecution, model, agentSystemPrompt, connectors } = c.req.valid('json')

    // Create a conversation if none provided
    let conversationId = reqConvId
    if (!conversationId) {
      const conv = await conversationRepo.create(tenantId, userId, prompt.slice(0, 80))
      conversationId = conv.id
    }

    if (stream) {
      // SSE streaming — each WorkflowEvent is an SSE data line
      return streamSSE(c, async (sse) => {
        try {
          for await (const event of agentOrchestrator.execute(
            prompt,
            tenantId,
            userId,
            role,
            conversationId,
            attachmentIds,
            forceCodeExecution,
            model,
            agentSystemPrompt,
            connectors,
          )) {
            await sse.writeSSE({
              data: JSON.stringify(event),
              event: event.type,
            })

            // Close stream on terminal events
            if (
              event.type === 'workflow.completed' ||
              event.type === 'workflow.failed'
            ) {
              break
            }
          }
        } catch (err) {
          await sse.writeSSE({
            data: JSON.stringify({ type: 'error', error: (err as Error).message }),
            event: 'error',
          })
        }
      })
    }

    // Non-streaming: collect all events and return final result
    let finalResult: unknown = null
    let finalError: string | null = null

    for await (const event of agentOrchestrator.execute(
      prompt,
      tenantId,
      userId,
      role,
      conversationId,
      attachmentIds,
      forceCodeExecution,
      model,
      agentSystemPrompt,
      connectors,
    )) {
      if (event.type === 'workflow.completed') finalResult = event.result
      if (event.type === 'workflow.failed') finalError = event.error
    }

    if (finalError) {
      return c.json({ error: finalError, conversationId }, 500)
    }

    return c.json({ result: finalResult, conversationId })
  },
)
