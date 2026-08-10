import { z } from 'zod'

export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  toolCallId: z.string().optional(),
  timestamp: z.string().datetime().optional(),
})

export const AppendMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().min(1),
})

export const CreateConversationSchema = z.object({
  title: z.string().max(256).nullable().optional(),
})

export const UpdateConversationSchema = z.object({
  title: z.string().max(256),
})

export type Message = z.infer<typeof MessageSchema>

export interface ContextSnapshot {
  userId: string
  tenantId: string
  conversationId: string
  messages: Message[]
  artifactRefs: string[]
  capturedAt: string
}
