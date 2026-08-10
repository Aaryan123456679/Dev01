// Apple Notes MCP server (Streamable HTTP, stateless).
//
// Exposes tools that let the agent create and list notes in the macOS Notes app
// via AppleScript. Run alongside the backend on the host (Notes access is local):
//   node integrations/notes-mcp-server.mjs   (port 7900, endpoint /mcp)
//
// It is registered in the frontend as a built-in connector, so users can create
// notes straight from the chat input box.

import http from 'node:http'
import { execFile } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const PORT = process.env.NOTES_MCP_PORT ? Number(process.env.NOTES_MCP_PORT) : 7900

function osascript(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script, ...args], { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

// Notes treats the body as HTML; preserve line breaks.
const toHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')

async function createNote(title, body) {
  // Args are passed via `on run argv` so no string escaping into the script is needed.
  const script = `
on run argv
  set t to item 1 of argv
  set b to item 2 of argv
  tell application "Notes"
    set newNote to make new note with properties {name:t, body:("<div><b>" & t & "</b></div>" & b)}
    return id of newNote
  end tell
end run`
  const id = await osascript(script, [title, toHtml(body)])
  return id
}

async function listNotes(limit) {
  const script = `
on run argv
  set lim to (item 1 of argv) as integer
  set out to ""
  tell application "Notes"
    set theNotes to notes
    set n to count of theNotes
    if n > lim then set n to lim
    repeat with i from 1 to n
      set out to out & (name of (item i of theNotes)) & linefeed
    end repeat
  end tell
  return out
end run`
  const out = await osascript(script, [String(limit ?? 10)])
  return out.split('\n').filter(Boolean)
}

function makeServer() {
  const mcp = new McpServer({ name: 'apple-notes', version: '1.0.0' })

  mcp.tool(
    'create_note',
    'Create a new note in the Apple Notes app. Provide a short title and the note body text.',
    { title: z.string().describe('note title'), body: z.string().describe('note content') },
    async ({ title, body }) => {
      try {
        const id = await createNote(title || 'Untitled note', body || '')
        return { content: [{ type: 'text', text: `Created note "${title}" (id: ${id})` }] }
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to create note: ${e.message}` }], isError: true }
      }
    },
  )

  mcp.tool(
    'list_notes',
    'List the titles of the most recent notes in the Apple Notes app.',
    { limit: z.number().optional().describe('how many notes to list (default 10)') },
    async ({ limit }) => {
      try {
        const titles = await listNotes(limit ?? 10)
        return { content: [{ type: 'text', text: titles.length ? titles.join('\n') : '(no notes)' }] }
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to list notes: ${e.message}` }], isError: true }
      }
    },
  )

  return mcp
}

const server = http.createServer(async (req, res) => {
  if (req.url !== '/mcp') { res.writeHead(404); res.end('not found'); return }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    let parsed
    try { parsed = body ? JSON.parse(body) : undefined } catch {}
    const mcp = makeServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => { transport.close(); mcp.close() })
    try {
      await mcp.connect(transport)
      await transport.handleRequest(req, res, parsed)
    } catch (e) {
      if (!res.headersSent) { res.writeHead(500); res.end(String(e)) }
    }
  })
})

server.listen(PORT, () => console.log(`Apple Notes MCP server on http://localhost:${PORT}/mcp`))
