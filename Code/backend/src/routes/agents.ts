import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { llmRegistry } from '../lib/llm/registry'
import type { HonoEnv } from '../types/common'

export const agentsRouter = new Hono<HonoEnv>()

const GenerateAgentSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(8_000),
  // Optional extracted text from a device file/app to ground the agent in.
  context: z.string().max(20_000).optional(),
  model: z.string().optional(),
})

const SYSTEM = `You are an expert at writing system prompts for AI agents.
Given an agent name, a description of what it should do, and optional reference
material, write a single, focused system prompt that defines the agent's role,
behavior, tone, and constraints. Output ONLY the system prompt text — no preamble,
no markdown fences, no commentary.`

// Generate a custom-agent system prompt with the LLM. The agent itself is stored
// client-side per user; this endpoint just produces the persona text.
agentsRouter.post('/generate', zValidator('json', GenerateAgentSchema), async (c) => {
  const { name, description, context, model } = c.req.valid('json')
  const llm = llmRegistry.getDefault()

  const userContent = [
    `Agent name: ${name}`,
    `What it should do: ${description}`,
    context ? `Reference material from the user's file/app:\n${context}` : '',
    `\nWrite the system prompt for this agent.`,
  ]
    .filter(Boolean)
    .join('\n')

  const res = await llm.generate({
    model,
    systemPrompt: SYSTEM,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0.4,
    maxOutputTokens: 1024,
  })

  return c.json({ systemPrompt: res.content.trim() })
})
