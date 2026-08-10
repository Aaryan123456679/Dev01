import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import type { HonoEnv, AppError } from './types/common'

// Routes
import { authRouter } from './routes/auth'
import { conversationsRouter } from './routes/conversations'
import { workflowsRouter } from './routes/workflows'
import { executeRouter } from './routes/execute'
import { sandboxRouter } from './routes/sandbox'
import { artifactsRouter } from './routes/artifacts'
import { storageRouter } from './routes/storage'
import { mcpRouter } from './routes/mcp'
import { mediaRouter } from './routes/media'
import { downloadsRouter } from './routes/downloads'
import { modelsRouter } from './routes/models'
import { agentsRouter } from './routes/agents'
import { connectorsRouter } from './routes/connectors'
import { integrationsRouter } from './routes/integrations'

// Middleware
import { authMiddleware } from './middleware/auth'
import { tenantMiddleware } from './middleware/tenant'
import { requestMetricsMiddleware } from './lib/observability/metrics'
import { logger } from './lib/observability/logger'

// LLM registry
import { llmRegistry } from './lib/llm/registry'
import { GeminiProvider } from './lib/llm/gemini'

// MCP registry + adapters
import { mcpRegistry } from './lib/mcp/registry'
import { LLMMCPAdapter } from './lib/mcp/adapters/llm.adapter'
import { SandboxMCPAdapter } from './lib/mcp/adapters/sandbox.adapter'
import { StorageMCPAdapter } from './lib/mcp/adapters/storage.adapter'
import { FileMCPAdapter } from './lib/mcp/adapters/file.adapter'
import { DownloadMCPAdapter } from './lib/mcp/adapters/download.adapter'
import { MediaMCPAdapter } from './lib/mcp/adapters/media.adapter'

// ── Bootstrap registries ──────────────────────────────────────────────────────
llmRegistry.register(new GeminiProvider())
llmRegistry.setDefault('gemini')

mcpRegistry.register(new LLMMCPAdapter())
mcpRegistry.register(new SandboxMCPAdapter())
mcpRegistry.register(new StorageMCPAdapter())
mcpRegistry.register(new FileMCPAdapter())
mcpRegistry.register(new DownloadMCPAdapter())
mcpRegistry.register(new MediaMCPAdapter())

logger.info('registries initialized', {
  llmProviders: llmRegistry.list(),
  mcpTools: mcpRegistry.discover().map((t) => t.name),
})

const app = new Hono<HonoEnv>()

// ── Global middleware ──────────────────────────────────────────────────────────
app.use(
  '*',
  cors({
    origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
)
app.use('*', requestMetricsMiddleware)

// ── Health check (public) ──────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() }),
)

// ── Auth + public OAuth callbacks ──────────────────────────────────────────────
app.route('/auth', authRouter)


// ── Protected API routes ───────────────────────────────────────────────────────
const api = new Hono<HonoEnv>()
api.use('*', authMiddleware, tenantMiddleware)

api.route('/conversations', conversationsRouter)
api.route('/workflows', workflowsRouter)
api.route('/execute', executeRouter)
api.route('/sandbox', sandboxRouter)
api.route('/artifacts', artifactsRouter)
api.route('/storage', storageRouter)
api.route('/mcp', mcpRouter)
api.route('/media', mediaRouter)
api.route('/downloads', downloadsRouter)
api.route('/models', modelsRouter)
api.route('/agents', agentsRouter)
api.route('/connectors', connectorsRouter)
api.route('/integrations', integrationsRouter)

app.route('/api/v1', api)

// ── Global error handler ───────────────────────────────────────────────────────
app.onError((err, c) => {
  const appErr = err as AppError
  if (appErr.statusCode) {
    return c.json(
      { error: appErr.message, code: appErr.code },
      appErr.statusCode as Parameters<typeof c.json>[1],
    )
  }
  console.error('[Unhandled]', err)
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500)
})

app.notFound((c) => c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404))

// ── Start server ───────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '8000', 10)
serve({ fetch: app.fetch, port }, () => {
  console.log(`[server] Dev01 backend running on port ${port}`)
})

export default app
