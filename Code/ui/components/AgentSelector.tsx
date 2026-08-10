'use client'

import { useEffect, useRef, useState } from 'react'
import { getAllAgents, type Agent } from '../lib/agents'

interface AgentSelectorProps {
  activeId: string
  onSelect: (agent: Agent) => void
  onManage: () => void
}

export function AgentSelector({ activeId, onSelect, onManage }: AgentSelectorProps) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const refresh = () => setAgents(getAllAgents())

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener('agents-changed', onChange)
    return () => window.removeEventListener('agents-changed', onChange)
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const active = agents.find((a) => a.id === activeId) ?? agents[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="agent-selector"
        className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
      >
        <span>{active?.icon ?? '🤖'}</span>
        <span className="max-w-[120px] truncate">{active?.name ?? 'Agent'}</span>
        <span className="text-gray-500">▴</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-lg border border-gray-800 bg-gray-900 shadow-xl"
          data-testid="agent-dropdown">
          <div className="max-h-72 overflow-y-auto py-1">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => { onSelect(a); setOpen(false) }}
                data-testid={`agent-option-${a.id}`}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-gray-800 ${a.id === activeId ? 'bg-gray-800' : ''}`}
              >
                <span className="mt-0.5">{a.icon ?? '🤖'}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-white">{a.name} {a.id === activeId && '✓'}</span>
                  <span className="block truncate text-xs text-gray-500">{a.description}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setOpen(false); onManage() }}
            data-testid="agent-manage"
            className="block w-full border-t border-gray-800 px-3 py-2 text-left text-xs text-blue-400 hover:bg-gray-800"
          >
            + Create / manage agents
          </button>
        </div>
      )}
    </div>
  )
}
