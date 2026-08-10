import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ConversationRepo } from '../repositories/conversation.repo'
import { storageService } from '../lib/supabase/storage'
import {
  CreateConversationSchema,
  UpdateConversationSchema,
  AppendMessageSchema,
} from '../types/context'
import type { HonoEnv, DbMessage } from '../types/common'

export const conversationsRouter = new Hono<HonoEnv>()
const repo = new ConversationRepo()

conversationsRouter.get('/', async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const conversations = await repo.findByUser(tenantId, userId)
  return c.json({ data: conversations })
})

conversationsRouter.post('/', zValidator('json', CreateConversationSchema), async (c) => {
  const { tenantId, userId } = c.get('tenantCtx')
  const { title } = c.req.valid('json')
  const conversation = await repo.create(tenantId, userId, title)
  return c.json(conversation, 201)
})

conversationsRouter.get('/:id', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const conversation = await repo.getWithMessages(c.req.param('id'), tenantId)
  return c.json(conversation)
})

conversationsRouter.patch('/:id', zValidator('json', UpdateConversationSchema), async (c) => {
  const { tenantId } = c.get('tenantCtx')
  const { title } = c.req.valid('json')
  await repo.updateTitle(c.req.param('id'), tenantId, title)
  return c.body(null, 204)
})

conversationsRouter.delete('/:id', async (c) => {
  const { tenantId } = c.get('tenantCtx')
  // Permanently remove the conversation and all related rows, then purge the
  // backing storage objects (best-effort).
  const storagePaths = await repo.hardDelete(c.req.param('id'), tenantId)
  for (const path of storagePaths) {
    const bucket = path.includes('/media/') ? 'media' : 'uploads'
    await storageService.deleteObject(bucket as 'media' | 'uploads', path).catch(() => {})
  }
  return c.body(null, 204)
})

conversationsRouter.post(
  '/:id/messages',
  zValidator('json', AppendMessageSchema),
  async (c) => {
    const { tenantId } = c.get('tenantCtx')
    const { role, content } = c.req.valid('json')
    const msg: DbMessage = { role, content, timestamp: new Date().toISOString() }
    const updated = await repo.appendMessage(c.req.param('id'), tenantId, msg)
    return c.json(updated)
  },
)
