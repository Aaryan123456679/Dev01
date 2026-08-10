import type { MCPProvider, MCPTool, MCPContext, MCPCategory } from './types'
import {
  MCPProviderNotFoundError,
  MCPToolNotFoundError,
  MCPExecutionError,
  MCPValidationError,
} from './types'

export class MCPRegistry {
  // category → provider (one active per category; last-registered wins)
  private providers = new Map<MCPCategory, MCPProvider>()
  // tool name → provider (for fast tool lookup)
  private toolIndex = new Map<string, MCPProvider>()

  register(provider: MCPProvider): void {
    this.providers.set(provider.category, provider)
    for (const tool of provider.tools()) {
      this.toolIndex.set(tool.name, provider)
    }
  }

  resolve(category: MCPCategory): MCPProvider {
    const provider = this.providers.get(category)
    if (!provider) throw new MCPProviderNotFoundError(category)
    return provider
  }

  discover(): MCPTool[] {
    const tools: MCPTool[] = []
    for (const provider of this.providers.values()) {
      tools.push(...provider.tools())
    }
    return tools
  }

  async execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown> {
    const provider = this.toolIndex.get(toolName)
    if (!provider) throw new MCPToolNotFoundError(toolName)

    // Find the tool schema for input validation
    const tool = provider.tools().find((t) => t.name === toolName)
    if (!tool) throw new MCPToolNotFoundError(toolName)

    const parseResult = tool.inputSchema.safeParse(input)
    if (!parseResult.success) {
      throw new MCPValidationError(toolName, parseResult.error.message)
    }

    try {
      return await provider.execute(toolName, parseResult.data, ctx)
    } catch (err) {
      if (err instanceof MCPExecutionError) throw err
      throw new MCPExecutionError(
        `Tool '${toolName}' execution failed: ${(err as Error).message}`,
        toolName,
        err as Error,
      )
    }
  }

  listProviders(): Array<{ name: string; category: MCPCategory; version: string }> {
    return Array.from(this.providers.values()).map((p) => ({
      name: p.name,
      category: p.category,
      version: p.version,
    }))
  }
}

export const mcpRegistry = new MCPRegistry()
