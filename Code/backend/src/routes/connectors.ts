import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ConnectorConfigSchema } from '../types/execute'
import { ConnectorSession } from '../lib/mcp/connectors/session'
import type { HonoEnv } from '../types/common'

export const connectorsRouter = new Hono<HonoEnv>()

// Test a connector and return the tools it exposes. Works for both real MCP
// servers (mcp-http) and MCP-adjacent HTTP manifests (http).
connectorsRouter.post('/test', zValidator('json', ConnectorConfigSchema), async (c) => {
  const config = c.req.valid('json')
  const session = new ConnectorSession([config])
  try {
    await session.discover()
    return c.json({ ok: true, tools: session.toolList() })
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 200)
  } finally {
    await session.close()
  }
})
