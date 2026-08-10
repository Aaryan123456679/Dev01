// Catalog of selectable Gemini models with their free-tier daily request limits.
// The free tier quota is per-project-per-model-per-day, and all users share one
// API key (one project), so a single global per-model counter accurately tracks
// remaining quota.

export interface ModelInfo {
  id: string
  label: string
  description: string
  dailyLimit: number
}

// gemini-2.0-flash and gemini-2.0-flash-lite are excluded — confirmed 0 free-tier
// quota on this project (API returns 429 with limit:0 for both).
export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite (latest)', description: 'Fast & cheap — best daily quota', dailyLimit: 1000 },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', description: 'Fast, lightweight', dailyLimit: 1000 },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)', description: 'Higher quality, balanced', dailyLimit: 250 },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Pro — higher quality (low daily quota)', dailyLimit: 20 },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', description: 'Default — paid key, no free-tier quota ceiling', dailyLimit: 1500 },
]

export const MODEL_IDS = AVAILABLE_MODELS.map((m) => m.id)

export function isValidModel(id: string): boolean {
  return MODEL_IDS.includes(id)
}

// --- per-user daily usage counter, persisted across restarts ----------------
// Each user gets their own per-model counter, reset at UTC midnight.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface UsageFile {
  date: string
  users: Record<string, Record<string, number>>
}

const USAGE_FILE = join(process.cwd(), '.usage.json')
let usageDate = new Date().toISOString().slice(0, 10)
let userCounts: Record<string, Record<string, number>> = {}

;(function loadUsage() {
  try {
    const saved = JSON.parse(readFileSync(USAGE_FILE, 'utf-8')) as UsageFile
    if (saved.date === usageDate) userCounts = saved.users ?? {}
  } catch {
    /* no prior usage file */
  }
})()

function persist() {
  try {
    writeFileSync(USAGE_FILE, JSON.stringify({ date: usageDate, users: userCounts }))
  } catch {
    /* best-effort */
  }
}

function rolloverIfNeeded() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== usageDate) {
    usageDate = today
    userCounts = {}
    persist()
  }
}

export function recordUsage(model: string, userId: string) {
  rolloverIfNeeded()
  if (!userCounts[userId]) userCounts[userId] = {}
  userCounts[userId]![model] = (userCounts[userId]![model] ?? 0) + 1
  persist()
}

export function getUsage(userId: string): Array<ModelInfo & { used: number; remaining: number }> {
  rolloverIfNeeded()
  const counts = userCounts[userId] ?? {}
  return AVAILABLE_MODELS.map((m) => {
    const used = counts[m.id] ?? 0
    return { ...m, used, remaining: Math.max(0, m.dailyLimit - used) }
  })
}
