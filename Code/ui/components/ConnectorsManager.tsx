'use client'

import { useEffect, useState } from 'react'
import { api } from '../lib/api/client'

// ── Types (mirroring backend) ─────────────────────────────────────────────────

interface CredentialSpec {
  name: string
  label: string
  description: string
  secret: boolean
}

interface RegistryEntry {
  id: string
  normalized_name: string
  display_name: string
  connector_type: string
  has_official_mcp: boolean
  base_url: string | null
  auth_type: string
  required_credentials: CredentialSpec[]
  setup_steps: string[]
  documentation_url: string | null
}

interface Connection {
  provider: string
  accountLabel: string | null
  connectedAt: string
}

// ── Helper ────────────────────────────────────────────────────────────────────

function providerIcon(provider: string): string {
  const icons: Record<string, string> = {
    notion: '📝', figma: '🎨', github: '🐙', slack: '💬', linear: '📋',
    jira: '🟦', medium: '📰', dropbox: '📦', gmail: '📧', trello: '📌',
    asana: '🗂️', airtable: '📊', stripe: '💳', shopify: '🛍️',
    unsplash: '🖼️', kaggle: '📊', twitter: '🐦', spotify: '🎵',
  }
  return icons[provider] ?? '🔌'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SetupSteps({ steps }: { steps: string[] }) {
  if (!steps.length) return null
  return (
    <ol className="mt-2 space-y-1 text-[11px] text-gray-400">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="shrink-0 font-mono text-blue-500">{i + 1}.</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  )
}

function ConnectForm({
  entry,
  onConnected,
  onCancel,
}: {
  entry: RegistryEntry
  onConnected: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSteps, setShowSteps] = useState(true)

  const set = (name: string, val: string) => setValues((v) => ({ ...v, [name]: val }))

  const save = async () => {
    const missing = entry.required_credentials.find((c) => !values[c.name]?.trim())
    if (missing) { setStatus(`${missing.label} is required`); return }
    setSaving(true); setStatus(null)
    try {
      const credentials: Record<string, string> = {}
      for (const cred of entry.required_credentials) credentials[cred.name] = values[cred.name].trim()
      await api.post('/api/v1/integrations/connect', {
        provider: entry.normalized_name,
        credentials,
        accountLabel: label.trim() || null,
      })
      setStatus('✓ Connected!')
      setTimeout(onConnected, 600)
    } catch (err) { setStatus(`✗ ${(err as Error).message}`) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold text-white">Connect {entry.display_name}</h5>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-300">✕ Cancel</button>
      </div>

      {entry.has_official_mcp && (
        <p className="rounded bg-blue-950 px-2 py-1 text-[11px] text-blue-400">
          🔗 {entry.display_name} has an official MCP server — connected via its REST API for full capability.
        </p>
      )}

      {entry.setup_steps.length > 0 && (
        <div className="rounded-md border border-gray-700 bg-gray-950 p-2">
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="text-[11px] font-medium text-blue-400 hover:underline"
          >
            {showSteps ? '▾ Hide setup steps' : '▸ Show setup steps'}
          </button>
          {showSteps && <SetupSteps steps={entry.setup_steps} />}
        </div>
      )}

      {entry.required_credentials.map((cred) => (
        <div key={cred.name}>
          <label className="mb-1 block text-[11px] font-medium text-gray-300">{cred.label}</label>
          <p className="mb-1 text-[10px] text-gray-500">{cred.description}</p>
          <input
            type={cred.secret ? 'password' : 'text'}
            value={values[cred.name] ?? ''}
            onChange={(e) => set(cred.name, e.target.value)}
            placeholder={cred.label}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      ))}

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Account label (optional)"
        className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
      />

      {entry.documentation_url && (
        <p className="text-[10px] text-gray-600">
          Docs:{' '}
          <a href={entry.documentation_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            {entry.documentation_url}
          </a>
        </p>
      )}

      {status && <p className={`text-xs ${status.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? 'Connecting…' : 'Save & connect'}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ConnectorsManager() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [registry, setRegistry] = useState<RegistryEntry[]>([])
  const [status, setStatus] = useState<string | null>(null)

  const [discoverInput, setDiscoverInput] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [pendingEntry, setPendingEntry] = useState<RegistryEntry | null>(null)

  const refresh = async () => {
    try {
      const r = await api.get<{ data: Connection[]; registry: RegistryEntry[] }>('/api/v1/integrations')
      setConnections(r.data)
      setRegistry(r.registry ?? [])
    } catch { /* ignore */ }
  }

  useEffect(() => { refresh() }, [])

  const discover = async () => {
    if (!discoverInput.trim()) return
    setDiscovering(true); setStatus(null); setPendingEntry(null)
    try {
      const { entry } = await api.post<{ entry: RegistryEntry }>('/api/v1/integrations/discover', {
        productName: discoverInput.trim(),
      })
      if (connections.find((c) => c.provider === entry.normalized_name)) {
        setStatus(`✓ ${entry.display_name} is already connected.`)
      } else {
        setPendingEntry(entry)
        setRegistry((r) => r.find((e) => e.normalized_name === entry.normalized_name) ? r : [...r, entry])
        setStatus(null)
      }
      setDiscoverInput('')
    } catch (err) { setStatus(`✗ ${(err as Error).message}`) } finally { setDiscovering(false) }
  }

  const disconnect = async (provider: string) => {
    await api.delete(`/api/v1/integrations/${provider}`).catch(() => {})
    refresh()
  }

  const connectedProviders = new Set(connections.map((c) => c.provider))
  const availableInRegistry = registry.filter((e) => !connectedProviders.has(e.normalized_name))

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Connect any app — the agent discovers its API and builds capabilities on demand.
      </p>

      {/* ── Discovery input ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-700 bg-gray-950 p-4">
        <h4 className="mb-2 text-sm font-semibold text-white">Connect a new app</h4>
        <div className="flex gap-2">
          <input
            value={discoverInput}
            onChange={(e) => setDiscoverInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && discover()}
            placeholder="Type a product name, e.g. Notion, Figma, GitHub, Slack…"
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={discover}
            disabled={discovering || !discoverInput.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {discovering ? 'Discovering…' : 'Discover'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-600">
          Searches for the API, required credentials, and setup steps automatically.
        </p>

        {pendingEntry && (
          <div className="mt-4 rounded-md border border-blue-800 bg-blue-950/30 p-4">
            <ConnectForm
              entry={pendingEntry}
              onConnected={() => { setPendingEntry(null); refresh() }}
              onCancel={() => setPendingEntry(null)}
            />
          </div>
        )}
      </div>

      {/* ── Connected apps ────────────────────────────────────────────────── */}
      {connections.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Connected apps</h4>
          {connections.map((conn) => {
            const entry = registry.find((e) => e.normalized_name === conn.provider)
            return (
              <div key={conn.provider} className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span>{providerIcon(conn.provider)}</span>
                  <span className="font-medium text-white">{entry?.display_name ?? conn.provider}</span>
                  <span className="text-xs text-green-400">
                    connected{conn.accountLabel ? ` · ${conn.accountLabel}` : ''}
                  </span>
                  {entry?.has_official_mcp && (
                    <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-400">MCP</span>
                  )}
                  <button onClick={() => disconnect(conn.provider)} className="ml-auto text-xs text-red-400 hover:underline">Disconnect</button>
                </div>
                {entry && (
                  <p className="mt-0.5 pl-6 text-[10px] text-gray-500">
                    {entry.base_url ?? ''} · {entry.auth_type}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Available from registry (discovered but not yet connected) ──── */}
      {availableInRegistry.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Available connectors</h4>
          {availableInRegistry.map((entry) => (
            <div
              key={entry.normalized_name}
              className="flex items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
            >
              <span>{providerIcon(entry.normalized_name)}</span>
              <span className="font-medium text-white">{entry.display_name}</span>
              {entry.has_official_mcp && (
                <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] text-blue-400">MCP</span>
              )}
              <span className="truncate text-xs text-gray-500">{entry.base_url ?? ''}</span>
              <button
                onClick={() => setPendingEntry(entry)}
                className="ml-auto rounded-md bg-gray-700 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-600"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="text-sm text-blue-400">{status}</p>}
    </div>
  )
}
