import { z } from 'zod'
import { llmRegistry } from '../../llm/registry'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { MCPExecutionError } from '../types'

const GenerateInputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'model', 'system', 'tool']),
      content: z.string(),
    }),
  ),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  tools: z.array(z.unknown()).optional(),
  model: z.string().optional(),
})

const StreamInputSchema = GenerateInputSchema

const EmbeddingsInputSchema = z.object({
  texts: z.array(z.string()).min(1),
  model: z.string().optional(),
})

export class LLMMCPAdapter implements MCPProvider {
  readonly name = 'gemini-llm'
  readonly category = 'llm' as const
  readonly version = '1.0.0'

  tools(): MCPTool[] {
    return [
      {
        name: 'llm.generate',
        description: 'Generate a response from the LLM given a message history',
        category: 'llm',
        version: '1.0.0',
        inputSchema: GenerateInputSchema,
      },
      {
        name: 'llm.stream',
        description: 'Stream a response from the LLM (returns AsyncGenerator)',
        category: 'llm',
        version: '1.0.0',
        inputSchema: StreamInputSchema,
      },
      {
        name: 'llm.embeddings',
        description: 'Generate embeddings for an array of texts',
        category: 'llm',
        version: '1.0.0',
        inputSchema: EmbeddingsInputSchema,
      },
    ]
  }

  async execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown> {
    const provider = llmRegistry.getDefault()

    switch (toolName) {
      case 'llm.generate': {
        const parsed = GenerateInputSchema.parse(input)
        return provider.generate({ ...(parsed as any), userId: ctx.userId })
      }
      case 'llm.stream': {
        const parsed = GenerateInputSchema.parse(input)
        const chunks: string[] = []
        for await (const chunk of provider.stream({ ...(parsed as any), userId: ctx.userId })) {
          chunks.push(chunk.delta)
        }
        return { content: chunks.join('') }
      }
      case 'llm.embeddings': {
        const parsed = EmbeddingsInputSchema.parse(input)
        return provider.embeddings(parsed)
      }
      default:
        throw new MCPExecutionError(`Unknown tool: ${toolName}`, toolName)
    }
  }
}
