'use client'

import { useState } from 'react'
import { Markdown } from './Markdown'
import { ToolCallCard } from './ToolCallCard'
import type { ChatTurn } from '../lib/types'

function errorLabel(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('quota') || m.includes('resource_exhausted') || m.includes('429')) return 'Quota exceeded'
  if (m.includes('503') || m.includes('service unavailable') || m.includes('overloaded')) return 'Service unavailable'
  if (m.includes('401') || m.includes('unauthorized') || m.includes('invalid.*token') || m.includes('token.*invalid')) return 'Authentication error'
  if (m.includes('403') || m.includes('forbidden')) return 'Access denied'
  if (m.includes('404') || m.includes('not found')) return 'Not found'
  if (m.includes('timeout') || m.includes('timed out')) return 'Timeout'
  if (m.includes('network') || m.includes('fetch')) return 'Network error'
  if (m.includes('credential') || m.includes('invalid_credentials')) return 'Credential error'
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Rate limited'
  return 'Internal error'
}

function CollapsibleError({ message }: { message: string }) {
  const [open, setOpen] = useState(false)
  const label = errorLabel(message)
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-start gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
        title={open ? 'Collapse error details' : 'Expand error details'}
      >
        <span className="min-w-0 break-words text-left">⚠ Something went wrong — {label}</span>
        <span className="mt-px flex-shrink-0 text-[10px] text-red-500/70">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <pre className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 font-mono text-[11px] text-red-300">
          {message}
        </pre>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={copy}
      data-testid="copy-answer"
      className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      title="Copy answer"
    >
      {copied ? '✓ Copied' : '⧉ Copy'}
    </button>
  )
}

interface ChatMessageProps {
  turn: ChatTurn
  onRetry?: () => void
  onEdit?: (newContent: string) => void
}

export function ChatMessage({ turn, onRetry, onEdit }: ChatMessageProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(turn.content)

  if (turn.role === 'user') {
    return (
      <div className="group flex justify-end" data-testid="msg-user">
        <div className="flex flex-col items-end gap-1">
          {editing ? (
            <div className="flex w-full max-w-[80%] flex-col gap-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={Math.max(2, editValue.split('\n').length)}
                autoFocus
                className="w-full resize-none rounded-2xl rounded-br-sm border border-blue-500 bg-blue-700 px-4 py-2.5 text-sm text-white focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setEditing(false); setEditValue(turn.content) }}
                  className="rounded-md px-3 py-1 text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setEditing(false); onEdit?.(editValue.trim()) }}
                  disabled={!editValue.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
              <p className="break-words whitespace-pre-wrap">{turn.content}</p>
              {turn.attachments && turn.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turn.attachments.map((a, i) => (
                    <span key={i} className="min-w-0 break-all rounded-full bg-blue-500/60 px-2 py-0.5 text-xs">📎 {a}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {!editing && (
            <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              {onEdit && (
                <button
                  onClick={() => { setEditValue(turn.content); setEditing(true) }}
                  className="text-[11px] text-gray-500 hover:text-gray-300"
                  title="Edit message"
                >
                  ✎ Edit
                </button>
              )}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-[11px] text-gray-500 hover:text-gray-300"
                  title="Retry message"
                >
                  ↩ Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start" data-testid="msg-assistant">
      <div className="flex max-w-[85%] gap-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
          A
        </div>
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-sm bg-gray-800 px-4 py-3 text-gray-100">
          {/* Tool usage cards (plan code, sandbox, tool calls, …) */}
          {turn.tools?.map((t) => <ToolCallCard key={t.id} tool={t} />)}

          {/* Final assistant answer */}
          {turn.content ? (
            <>
              <Markdown>{turn.content}</Markdown>
              <CopyButton text={turn.content} />
            </>
          ) : turn.status === 'running' ? (
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" />
            </span>
          ) : null}

          {turn.status === 'error' && turn.error && (
            <CollapsibleError message={turn.error} />
          )}
        </div>
      </div>
    </div>
  )
}
