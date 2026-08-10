'use client'

// Agent = a selectable persona (system prompt) applied to a chat turn.
// Built-in agents ship with the app; custom agents are created by the user
// (optionally AI-generated, possibly from a device file) and persisted per
// browser in localStorage so they're reusable across any chat.

export interface Agent {
  id: string
  name: string
  description: string
  systemPrompt: string // empty string = use backend default + auto intent
  builtin: boolean
  icon?: string
}

export const BUILTIN_AGENTS: Agent[] = [
  { id: 'auto', name: 'Auto', icon: '✨', builtin: true, systemPrompt: '',
    description: 'Automatically picks the best response (chat or code).' },
  { id: 'code', name: 'Code Expert', icon: '💻', builtin: true,
    systemPrompt: 'You are a senior software engineer. Give correct, idiomatic, well-explained code with brief reasoning. Prefer runnable examples.',
    description: 'Programming help with clear, runnable examples.' },
  { id: 'writer', name: 'Writer', icon: '✍️', builtin: true,
    systemPrompt: 'You are a skilled writing assistant. Produce clear, engaging, well-structured prose. Match the requested tone and length.',
    description: 'Drafting, editing, and rewriting text.' },
  { id: 'analyst', name: 'Data Analyst', icon: '📊', builtin: true,
    systemPrompt: 'You are a meticulous data analyst. Reason step by step, surface assumptions, and present findings with tables or bullet points where useful.',
    description: 'Analysis, summaries, and structured insights.' },
]

const STORAGE_KEY = 'customAgents'

export function getCustomAgents(): Agent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Agent[]) : []
  } catch {
    return []
  }
}

export function getAllAgents(): Agent[] {
  return [...BUILTIN_AGENTS, ...getCustomAgents()]
}

export function getAgentById(id: string): Agent | undefined {
  return getAllAgents().find((a) => a.id === id)
}

export function saveCustomAgent(agent: Omit<Agent, 'builtin'>): Agent {
  const custom = getCustomAgents()
  const existingIdx = custom.findIndex((a) => a.id === agent.id)
  const full: Agent = { ...agent, builtin: false }
  if (existingIdx >= 0) custom[existingIdx] = full
  else custom.push(full)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
  return full
}

export function deleteCustomAgent(id: string): void {
  const custom = getCustomAgents().filter((a) => a.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
}

export function newAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
