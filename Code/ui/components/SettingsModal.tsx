'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { api } from '../lib/api/client'
import { extractText, isExtractable } from '../lib/extract'
import { ConnectorsManager } from './ConnectorsManager'
import {
  getCustomAgents, saveCustomAgent, deleteCustomAgent, newAgentId, BUILTIN_AGENTS, type Agent,
} from '../lib/agents'
import type { Me, ModelUsage } from '../lib/types'

type Tab = 'profile' | 'quality' | 'models' | 'agents' | 'connectors' | 'appearance'

type QualityLevel = 'low' | 'medium' | 'high' | 'extra-high'

interface QualitySettings {
  imageGeneration: QualityLevel
  videoGeneration: QualityLevel
  tts: QualityLevel
  stt: QualityLevel
  textConversations: QualityLevel
  connectors: { quality: QualityLevel; maxInstances: number }
  sandboxing: { quality: QualityLevel; maxInstances: number }
}

const DEFAULT_QUALITY: QualitySettings = {
  imageGeneration: 'medium',
  videoGeneration: 'medium',
  tts: 'medium',
  stt: 'medium',
  textConversations: 'medium',
  connectors: { quality: 'high', maxInstances: 3 },
  sandboxing: { quality: 'medium', maxInstances: 2 },
}

const TEXT_QUALITY_TO_MODEL: Record<QualityLevel, string> = {
  'low': 'gemini-flash-lite-latest',
  'medium': 'gemini-2.5-flash-lite',
  'high': 'gemini-flash-latest',
  'extra-high': 'gemini-2.5-flash',
}

function loadQuality(): QualitySettings {
  try {
    const saved = localStorage.getItem('quality-settings')
    if (saved) return { ...DEFAULT_QUALITY, ...JSON.parse(saved) }
  } catch { /* ignore */ }
  return DEFAULT_QUALITY
}

function saveQuality(q: QualitySettings) {
  localStorage.setItem('quality-settings', JSON.stringify(q))
}

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  me: Me | null
  onMeChange: (me: Me) => void
  initialTab?: Tab
}

export function SettingsModal({ open, onClose, me, onMeChange, initialTab = 'profile' }: SettingsModalProps) {
  const { user: clerkUser } = useUser()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [displayName, setDisplayName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  // models
  const [models, setModels] = useState<ModelUsage[]>([])
  const [activeModel, setActiveModel] = useState<string>('')

  // agents
  const [customAgents, setCustomAgents] = useState<Agent[]>([])
  const [agentName, setAgentName] = useState('')
  const [agentDesc, setAgentDesc] = useState('')
  const [agentPrompt, setAgentPrompt] = useState('')
  const [agentContext, setAgentContext] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { if (open) setTab(initialTab) }, [open, initialTab])

  const [quality, setQuality] = useState<QualitySettings>(DEFAULT_QUALITY)

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme')) as 'dark' | 'light' | null
    if (savedTheme) setTheme(savedTheme)
    setActiveModel(localStorage.getItem('model') ?? '')
    setCustomAgents(getCustomAgents())
    setQuality(loadQuality())
  }, [open])

  useEffect(() => {
    if (me) setWorkspaceName(me.user.tenantName)
    setDisplayName(clerkUser?.firstName ?? '')
  }, [me, clerkUser])

  // Poll usage live while the Models tab is open so "remaining" updates in real time.
  useEffect(() => {
    if (!open || tab !== 'models') return
    let active = true
    const fetchUsage = () =>
      api.get<{ data: ModelUsage[] }>('/api/v1/models/usage').then((r) => { if (active) setModels(r.data) }).catch(() => {})
    fetchUsage()
    const iv = setInterval(fetchUsage, 4000)
    return () => { active = false; clearInterval(iv) }
  }, [open, tab])

  if (!open) return null

  const applyTheme = (t: 'dark' | 'light') => {
    setTheme(t)
    localStorage.setItem('theme', t)
    document.documentElement.classList.toggle('theme-light', t === 'light')
  }

  const isAdmin = me?.user.role === 'admin'

  const saveProfile = async () => {
    setSaving(true); setStatus(null)
    try {
      if (clerkUser && displayName !== (clerkUser.firstName ?? '')) {
        await clerkUser.update({ firstName: displayName })
      }
      if (isAdmin && me && workspaceName !== me.user.tenantName) {
        const res = await api.patch<{ tenantName: string }>('/auth/profile', { tenantName: workspaceName })
        onMeChange({ ...me, user: { ...me.user, tenantName: res.tenantName } })
      }
      setStatus('Saved ✓')
    } catch (err) { setStatus((err as Error).message) } finally { setSaving(false) }
  }

  const updateQuality = (patch: Partial<QualitySettings>) => {
    const next = { ...quality, ...patch }
    setQuality(next)
    saveQuality(next)
    if (patch.textConversations) {
      const modelId = TEXT_QUALITY_TO_MODEL[patch.textConversations]
      setActiveModel(modelId)
      localStorage.setItem('model', modelId)
      window.dispatchEvent(new Event('model-changed'))
    }
    setStatus('Quality settings saved ✓')
  }

  const selectModel = (id: string) => {
    setActiveModel(id)
    localStorage.setItem('model', id)
    window.dispatchEvent(new Event('model-changed'))
    setStatus(`Active model: ${id} ✓`)
  }

  const onAgentFile = async (file: File) => {
    if (!isExtractable(file)) { setStatus('Unsupported file for agent context'); return }
    setStatus('Reading file…')
    try {
      const { text } = await extractText(file)
      setAgentContext(text)
      setStatus(`Loaded ${file.name} as context ✓`)
    } catch (err) { setStatus((err as Error).message) }
  }

  const generatePrompt = async () => {
    if (!agentName.trim() || !agentDesc.trim()) { setStatus('Name and description required'); return }
    setGenerating(true); setStatus(null)
    try {
      const res = await api.post<{ systemPrompt: string }>('/api/v1/agents/generate', {
        name: agentName, description: agentDesc,
        context: agentContext || undefined,
        model: activeModel || undefined,
      })
      setAgentPrompt(res.systemPrompt)
      setStatus('Generated ✓ — review and save')
    } catch (err) { setStatus((err as Error).message) } finally { setGenerating(false) }
  }

  const saveAgent = () => {
    if (!agentName.trim() || !agentPrompt.trim()) { setStatus('Name and a system prompt are required'); return }
    saveCustomAgent({ id: newAgentId(), name: agentName.trim(), description: agentDesc.trim(), systemPrompt: agentPrompt.trim() })
    setCustomAgents(getCustomAgents())
    window.dispatchEvent(new Event('agents-changed'))
    setAgentName(''); setAgentDesc(''); setAgentPrompt(''); setAgentContext('')
    setStatus('Agent saved ✓ — pick it from the chat composer')
  }

  const removeAgent = (id: string) => {
    deleteCustomAgent(id)
    setCustomAgents(getCustomAgents())
    window.dispatchEvent(new Event('agents-changed'))
  }

  const TABS: Tab[] = ['profile', 'quality', 'models', 'agents', 'connectors', 'appearance']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} data-testid="settings-modal">
      <div className="flex h-[560px] w-full max-w-3xl overflow-hidden rounded-xl border border-gray-800 bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <nav className="w-40 flex-shrink-0 border-r border-gray-800 bg-gray-950 p-3">
          <h2 className="mb-3 px-2 text-sm font-semibold text-white">Settings</h2>
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setStatus(null) }} data-testid={`tab-${t}`}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm capitalize transition-colors ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}>
              {t}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold capitalize text-white">{tab}</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close">✕</button>
          </div>

          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400">Email</label>
                <input value={me?.user.email ?? ''} disabled className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400">Display name</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} data-testid="display-name-input"
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400">Workspace name {!isAdmin && <span className="text-gray-600">(admin only)</span>}</label>
                <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} disabled={!isAdmin} data-testid="workspace-name-input"
                  className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white disabled:opacity-50 focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400">Role</label>
                <p className="mt-1 text-sm capitalize text-gray-300">{me?.user.role ?? '—'}</p>
              </div>
              <button onClick={saveProfile} disabled={saving} data-testid="save-profile"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}

          {tab === 'quality' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                Fine-tune quality and resource limits per capability. Text quality auto-selects the matching model.
              </p>

              {/* Simple capabilities */}
              {(
                [
                  { key: 'imageGeneration', label: 'Image Generation' },
                  { key: 'videoGeneration', label: 'Video Generation' },
                  { key: 'tts', label: 'Text-to-Speech (TTS)' },
                  { key: 'stt', label: 'Speech-to-Text (STT)' },
                  { key: 'textConversations', label: 'Text Conversations' },
                ] as { key: keyof Pick<QualitySettings, 'imageGeneration' | 'videoGeneration' | 'tts' | 'stt' | 'textConversations'>; label: string }[]
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                  <span className="text-sm font-medium text-white">{label}</span>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high', 'extra-high'] as QualityLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => updateQuality({ [key]: lvl } as Partial<QualitySettings>)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${quality[key] === lvl ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Connectors */}
              <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Connectors</span>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high', 'extra-high'] as QualityLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => updateQuality({ connectors: { ...quality.connectors, quality: lvl } })}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${quality.connectors.quality === lvl ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs text-gray-400">Max instances</label>
                  <input
                    type="number" min={1} max={10}
                    value={quality.connectors.maxInstances}
                    onChange={(e) => updateQuality({ connectors: { ...quality.connectors, maxInstances: Math.max(1, Math.min(10, +e.target.value)) } })}
                    className="w-20 rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-600">(1 – 10)</span>
                </div>
              </div>

              {/* Sandboxing */}
              <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Sandboxing</span>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high', 'extra-high'] as QualityLevel[]).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => updateQuality({ sandboxing: { ...quality.sandboxing, quality: lvl } })}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${quality.sandboxing.quality === lvl ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs text-gray-400">Max instances</label>
                  <input
                    type="number" min={1} max={8}
                    value={quality.sandboxing.maxInstances}
                    onChange={(e) => updateQuality({ sandboxing: { ...quality.sandboxing, maxInstances: Math.max(1, Math.min(8, +e.target.value)) } })}
                    className="w-20 rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-600">(1 – 8)</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'models' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">Pick the model used for your chats. Each shows today&apos;s usage against its free-tier daily limit — switch to one with quota instead of hitting errors.</p>
              {models.length === 0 && <p className="text-xs text-gray-600">Loading usage…</p>}
              {models.map((m) => {
                const active = (activeModel || models[0]?.id) === m.id
                const pct = Math.min(100, Math.round((m.used / m.dailyLimit) * 100))
                const exhausted = m.remaining <= 0
                return (
                  <div key={m.id} className={`rounded-lg border p-3 ${active ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800'}`} data-testid={`model-${m.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-white">{m.label}</span>
                        <span className="ml-2 text-xs text-gray-500">{m.description}</span>
                      </div>
                      <button onClick={() => selectModel(m.id)} disabled={active} data-testid={`select-model-${m.id}`}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
                        {active ? 'Active' : 'Use'}
                      </button>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                      <div className={`h-full ${exhausted ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500" data-testid={`usage-${m.id}`}>
                      {m.used} / {m.dailyLimit} used today · {m.remaining} left{exhausted ? ' · exhausted' : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'agents' && (
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-white">Your agents</h4>
                <div className="space-y-2">
                  {BUILTIN_AGENTS.filter((a) => a.id !== 'auto').map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm">
                      <span>{a.icon}</span><span className="font-medium text-white">{a.name}</span>
                      <span className="text-xs text-gray-500">built-in</span>
                    </div>
                  ))}
                  {customAgents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm" data-testid="custom-agent-row">
                      <span>🤖</span><span className="font-medium text-white">{a.name}</span>
                      <span className="truncate text-xs text-gray-500">{a.description}</span>
                      <button onClick={() => removeAgent(a.id)} data-testid="delete-agent" className="ml-auto text-xs text-red-400 hover:underline">Delete</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-gray-950 p-4">
                <h4 className="mb-2 text-sm font-semibold text-white">Create a custom agent</h4>
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Agent name (e.g. SQL Helper)" data-testid="agent-name"
                  className="mb-2 w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
                <textarea value={agentDesc} onChange={(e) => setAgentDesc(e.target.value)} placeholder="Describe what this agent should do…" rows={2} data-testid="agent-desc"
                  className="mb-2 w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none" />
                <div className="mb-2 flex items-center gap-2">
                  <label className="cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
                    + From file (device)
                    <input type="file" className="hidden" data-testid="agent-file"
                      accept=".pdf,.docx,.txt,.md,.csv,.json"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onAgentFile(f); e.target.value = '' }} />
                  </label>
                  {agentContext && <span className="text-xs text-green-400">context loaded ({agentContext.length} chars)</span>}
                  <button onClick={generatePrompt} disabled={generating} data-testid="agent-generate"
                    className="ml-auto rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50">
                    {generating ? 'Generating…' : '✨ Generate with AI'}
                  </button>
                </div>
                <textarea value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} placeholder="System prompt (auto-generated or write your own)…" rows={5} data-testid="agent-prompt"
                  className="mb-2 w-full resize-none rounded-md border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-white focus:border-blue-500 focus:outline-none" />
                <button onClick={saveAgent} data-testid="agent-save"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Save agent</button>
              </div>
            </div>
          )}

          {tab === 'connectors' && <ConnectorsManager />}

          {tab === 'appearance' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Choose how Dev01 looks.</p>
              <div className="flex gap-3">
                {(['dark', 'light'] as const).map((t) => (
                  <button key={t} onClick={() => applyTheme(t)} data-testid={`theme-${t}`}
                    className={`flex-1 rounded-lg border p-4 text-sm capitalize transition-colors ${theme === t ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>
                    {t} {theme === t && '✓'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status && <p className="mt-4 text-sm text-blue-400" data-testid="settings-status">{status}</p>}
        </div>
      </div>
    </div>
  )
}
