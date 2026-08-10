import { z } from 'zod'
import { sandboxManager } from '../../sandbox/manager'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { MCPExecutionError } from '../types'

const CreateInputSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['admin', 'power', 'standard', 'readonly']),
  type: z.enum(['ephemeral', 'dedicated']).default('ephemeral'),
  workflowId: z.string().uuid().optional(),
})

const InjectInputSchema = z.object({
  sandboxId: z.string().uuid(),
  tenantId: z.string().uuid(),
  snapshot: z.unknown(),
})

const ExecuteInputSchema = z.object({
  sandboxId: z.string().uuid(),
  tenantId: z.string().uuid(),
  command: z.string().min(1),
  timeoutSeconds: z.number().int().positive().max(300).optional(),
})

const DestroyInputSchema = z.object({
  sandboxId: z.string().uuid(),
  tenantId: z.string().uuid(),
})

export class SandboxMCPAdapter implements MCPProvider {
  readonly name = 'sandbox-e2b'
  readonly category = 'sandbox' as const
  readonly version = '1.0.0'

  tools(): MCPTool[] {
    return [
      { name: 'sandbox.create',  description: 'Allocate a new sandbox',            category: 'sandbox', version: '1.0.0', inputSchema: CreateInputSchema  },
      { name: 'sandbox.inject',  description: 'Inject context into sandbox',        category: 'sandbox', version: '1.0.0', inputSchema: InjectInputSchema  },
      { name: 'sandbox.execute', description: 'Execute code inside sandbox',        category: 'sandbox', version: '1.0.0', inputSchema: ExecuteInputSchema },
      { name: 'sandbox.destroy', description: 'Terminate and destroy a sandbox',    category: 'sandbox', version: '1.0.0', inputSchema: DestroyInputSchema },
    ]
  }

  async execute(toolName: string, input: unknown, _ctx: MCPContext): Promise<unknown> {
    switch (toolName) {
      case 'sandbox.create': {
        const p = CreateInputSchema.parse(input)
        return sandboxManager.create(p.tenantId, p.userId, p.role, p.type, p.workflowId)
      }
      case 'sandbox.inject': {
        const p = InjectInputSchema.parse(input)
        return sandboxManager.injectContext(p.sandboxId, p.tenantId, p.snapshot as any)
      }
      case 'sandbox.execute': {
        const p = ExecuteInputSchema.parse(input)
        return sandboxManager.execute(p.sandboxId, p.tenantId, p.command, p.timeoutSeconds)
      }
      case 'sandbox.destroy': {
        const p = DestroyInputSchema.parse(input)
        await sandboxManager.destroy(p.sandboxId, p.tenantId)
        return { destroyed: true }
      }
      default:
        throw new MCPExecutionError(`Unknown tool: ${toolName}`, toolName)
    }
  }
}
