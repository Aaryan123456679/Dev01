'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClerk, useAuth } from '@clerk/nextjs'
import { api } from '../../lib/api/client'
import { ConversationPanel } from '../../components/ConversationPanel'
import { ChatMessage } from '../../components/ChatMessage'
import { FileUpload } from '../../components/FileUpload'
import { UserMenu } from '../../components/UserMenu'
import { SettingsModal } from '../../components/SettingsModal'
import { AgentSelector } from '../../components/AgentSelector'
import { getAgentById, type Agent } from '../../lib/agents'
import { getActiveConnectors, getActiveIds } from '../../lib/connectors'
import type {
  Conversation, WorkflowEvent, Me, AttachedFile, Message, ChatTurn, ToolCall,
} from '../../lib/types'

let idCounterSeed = 0
const newId = () => `t${Date.now()}-${idCounterSeed++}`

function messagesToTurns(messages: Message[]): ChatTurn[] {
  return messages.map((m) => ({
    id: newId(),
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
    status: 'done' as const,
  }))
}

function prettyToolName(stepId: string): string {
  if (stepId === 'sandbox-exec') return 'Sandbox execution'
  return 'Tool'
}

export default function ConsolePage() {
  const { signOut } = useClerk()
  const { isLoaded, isSignedIn } = useAuth()  // gate API calls until Clerk session is ready

  const [me, setMe] = useState<Me | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'profile' | 'agents' | 'models' | 'connectors'>('profile')
  const [activeAgentId, setActiveAgentId] = useState<string>('auto')
  const [connectorCount, setConnectorCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)


  const openSettings = (tab: 'profile' | 'agents' | 'models' | 'connectors' = 'profile') => {
    setSettingsTab(tab); setSettingsOpen(true)
  }

  // Keep the composer's active-connector badge in sync.
  useEffect(() => {
    const sync = () => setConnectorCount(getActiveIds().length)
    sync()
    window.addEventListener('connectors-changed', sync)
    return () => window.removeEventListener('connectors-changed', sync)
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns])

  // Apply persisted theme.
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    document.documentElement.classList.toggle('theme-light', saved === 'light')
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const conv = await api.get<Conversation>(`/api/v1/conversations/${convId}`)
      setTurns(messagesToTurns(conv.messages ?? []))
    } catch {
      setTurns([])
    }
  }, [])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    api.get<Me>('/auth/me').then(setMe).catch(() => {})
    api.get<{ data: Conversation[] }>('/api/v1/conversations').then((res) => {
      setConversations(res.data)
      if (res.data[0]) { setActiveConvId(res.data[0].id); loadMessages(res.data[0].id) }
    }).catch(() => {})
  }, [isLoaded, isSignedIn, loadMessages])

  const handleSelect = (id: string) => { setActiveConvId(id); loadMessages(id) }

  const handleNewConversation = async () => {
    try {
      const conv = await api.post<Conversation>('/api/v1/conversations', { title: null })
      setConversations((prev) => [conv, ...prev])
      setActiveConvId(conv.id)
      setTurns([])
    } catch { /* surfaced elsewhere */ }
  }

  const handleRename = async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
    try { await api.patch(`/api/v1/conversations/${id}`, { title }) } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConvId === id) { setActiveConvId(null); setTurns([]) }
    try { await api.delete(`/api/v1/conversations/${id}`) } catch { /* ignore */ }
  }

  const handleLogout = () => signOut({ redirectUrl: '/auth/login' })

  // Mutate the trailing assistant turn immutably.
  const updateAssistant = (fn: (t: ChatTurn) => ChatTurn) => {
    setTurns((prev) => {
      const idx = prev.map((t) => t.role).lastIndexOf('assistant')
      if (idx === -1) return prev
      const copy = [...prev]
      copy[idx] = fn(copy[idx]!)
      return copy
    })
  }

  const upsertTool = (turn: ChatTurn, stepId: string, patch: Partial<ToolCall>, base?: Partial<ToolCall>): ChatTurn => {
    const tools = [...(turn.tools ?? [])]
    const i = tools.findIndex((t) => t.id === stepId)
    if (i === -1) {
      tools.push({
        id: stepId,
        name: base?.name ?? prettyToolName(stepId),
        tool: base?.tool ?? 'tool',
        output: '',
        status: 'running',
        ...patch,
      })
    } else {
      tools[i] = { ...tools[i]!, ...patch }
    }
    return { ...turn, tools }
  }

  const runPromptWithText = async (text: string, forceCodeExecution: boolean, truncateTurnsTo?: number) => {
    if (!text.trim() || isRunning) return
    setIsRunning(true)

    if (truncateTurnsTo !== undefined) {
      setTurns((prev) => prev.slice(0, truncateTurnsTo))
    }

    const userTurn: ChatTurn = {
      id: newId(), role: 'user', content: text,
      attachments: attachedFiles.map((f) => f.name),
    }
    const assistantTurn: ChatTurn = { id: newId(), role: 'assistant', content: '', tools: [], status: 'running' }
    setTurns((prev) => [...prev, userTurn, assistantTurn])

    const agent = getAgentById(activeAgentId)
    const body = {
      prompt: text,
      conversationId: activeConvId ?? undefined,
      stream: true,
      attachmentIds: attachedFiles.map((f) => f.id),
      forceCodeExecution,
      model: (typeof window !== 'undefined' && localStorage.getItem('model')) || undefined,
      agentSystemPrompt: agent && agent.systemPrompt ? agent.systemPrompt : undefined,
      connectors: getActiveConnectors(),
    }
    setPrompt('')
    setAttachedFiles([])

    try {
      for await (const event of api.stream('/api/v1/execute', body)) {
        const ev = event as unknown as WorkflowEvent

        if (!activeConvId && ev.type === 'workflow.started') {
          api.get<{ data: Conversation[] }>('/api/v1/conversations').then((res) => {
            setConversations(res.data)
            if (res.data[0]) setActiveConvId(res.data[0].id)
          }).catch(() => {})
        }

        switch (ev.type) {
          case 'step.started':
            updateAssistant((t) => upsertTool(t, ev.stepId, { status: 'running' }, { name: ev.stepName, tool: ev.tool }))
            break
          case 'step.output':
            updateAssistant((t) => {
              const existing = (t.tools ?? []).find((x) => x.id === ev.stepId)
              const base = ev.stepId === 'sandbox-exec' ? { name: 'Sandbox execution', tool: 'sandbox' } : undefined
              return upsertTool(t, ev.stepId, { output: (existing?.output ?? '') + ev.chunk }, base)
            })
            break
          case 'step.completed':
            updateAssistant((t) => {
              const r = ev.result as { content?: string } | null
              const withTool = upsertTool(t, ev.stepId, { status: 'done' })
              return r?.content ? { ...withTool, content: r.content } : withTool
            })
            break
          case 'step.failed':
            updateAssistant((t) => upsertTool(t, ev.stepId, { status: ev.willRetry ? 'running' : 'failed', error: ev.error }))
            break
          case 'workflow.completed':
            updateAssistant((t) => {
              const r = ev.result as { content?: string } | null
              // Any tool still marked running has finished by now.
              const tools = (t.tools ?? []).map((x) => (x.status === 'running' ? { ...x, status: 'done' as const } : x))
              return { ...t, tools, status: 'done', content: r?.content ?? t.content }
            })
            break
          case 'workflow.failed':
            updateAssistant((t) => {
              const tools = (t.tools ?? []).map((x) => (x.status === 'running' ? { ...x, status: 'failed' as const } : x))
              return { ...t, tools, status: 'error', error: ev.error }
            })
            break
          case 'error':
            updateAssistant((t) => ({ ...t, status: 'error', error: ev.error }))
            break
        }

        if (ev.type === 'workflow.completed' || ev.type === 'workflow.failed') break
      }
      api.get<{ data: Conversation[] }>('/api/v1/conversations').then((res) => setConversations(res.data)).catch(() => {})
    } catch (err) {
      updateAssistant((t) => ({ ...t, status: 'error', error: (err as Error).message }))
    } finally {
      setIsRunning(false)
    }
  }

  const runPrompt = (forceCodeExecution: boolean) =>
    runPromptWithText(prompt, forceCodeExecution)

  const handleRetry = (turnId: string) => {
    const idx = turns.findIndex((t) => t.id === turnId)
    if (idx === -1 || isRunning) return
    const text = turns[idx]!.content
    runPromptWithText(text, false, idx)
  }

  const handleEdit = (turnId: string, newContent: string) => {
    const idx = turns.findIndex((t) => t.id === turnId)
    if (idx === -1 || isRunning) return
    runPromptWithText(newContent, false, idx)
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <ConversationPanel
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelect}
        onNew={handleNewConversation}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h1 className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-lg font-bold text-transparent">
            Dev01 Console
          </h1>
          <UserMenu me={me} onOpenSettings={() => openSettings('profile')} onLogout={handleLogout} />
        </header>


        {/* Chat thread */}
        <div className="flex-1 overflow-y-auto px-6 py-6" data-testid="chat-thread">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {turns.length === 0 && (
              <p className="mt-20 text-center text-sm text-gray-600">
                Start a conversation, or attach a document and ask about it.
              </p>
            )}
            {turns.map((t) => (
              <ChatMessage
                key={t.id}
                turn={t}
                onRetry={t.role === 'user' ? () => handleRetry(t.id) : undefined}
                onEdit={t.role === 'user' ? (newContent) => handleEdit(t.id, newContent) : undefined}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-gray-800 px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map((f) => (
                  <span key={f.id} className="flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                    📎 {f.name}
                    <button onClick={() => setAttachedFiles((prev) => prev.filter((x) => x.id !== f.id))}
                      className="text-gray-500 hover:text-red-400" aria-label={`Remove ${f.name}`}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="mb-2 flex items-center gap-2">
              <AgentSelector
                activeId={activeAgentId}
                onSelect={(a: Agent) => setActiveAgentId(a.id)}
                onManage={() => openSettings('agents')}
              />
              <button
                onClick={() => openSettings('connectors')}
                data-testid="connectors-button"
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
                title="MCP / MCP-adjacent connectors"
              >
                🔌 Connectors{connectorCount > 0 ? ` (${connectorCount})` : ''}
              </button>
              {connectorCount > 0 && <span className="text-xs text-green-500">tools enabled</span>}
            </div>
            <div className="flex items-end gap-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runPrompt(false) }
                }}
                placeholder="Message Dev01… (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={isRunning}
                className="flex-1 resize-none rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none disabled:opacity-50"
              />
              <div className="flex flex-col gap-2">
                <FileUpload onUploaded={(id, name) => setAttachedFiles((prev) => [...prev, { id, name }])} />
                <div className="flex gap-2">
                  <button
                    onClick={() => runPrompt(true)}
                    disabled={isRunning || !prompt.trim()}
                    data-testid="run-sandbox"
                    title="Generate code and run it in a sandbox"
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    ▶ Sandbox
                  </button>
                  <button
                    onClick={() => runPrompt(false)}
                    disabled={isRunning || !prompt.trim()}
                    data-testid="run-send"
                    className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                  >
                    {isRunning ? '…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} me={me} onMeChange={setMe} initialTab={settingsTab} />
    </div>
  )
}
