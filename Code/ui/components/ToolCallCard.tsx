'use client'

import { useState } from 'react'
import type { ToolCall } from '../lib/types'

const STATUS_STYLE: Record<ToolCall['status'], { dot: string; label: string }> = {
  running: { dot: 'bg-yellow-400 animate-pulse', label: 'Running' },
  done: { dot: 'bg-green-400', label: 'Done' },
  failed: { dot: 'bg-red-400', label: 'Failed' },
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  // Tool output is collapsed by default (ChatGPT-style), expandable on click.
  const [open, setOpen] = useState(false)
  const s = STATUS_STYLE[tool.status]
  const hasBody = !!tool.output.trim() || !!tool.error

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-gray-700 bg-gray-800/60" data-testid="tool-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-800"
        data-testid="tool-card-toggle"
      >
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} />
        <span className="font-medium text-gray-200">🔧 {tool.name}</span>
        <span className="rounded bg-gray-700 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">{tool.tool}</span>
        <span className="ml-auto text-[10px] text-gray-500">{s.label}</span>
        {hasBody && <span className="text-gray-500">{open ? '▾' : '▸'}</span>}
      </button>

      {open && hasBody && (
        <div className="border-t border-gray-700 bg-gray-950 px-3 py-2">
          {tool.output.trim() && (
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-300">
              {tool.output.trim()}
            </pre>
          )}
          {tool.error && (
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-red-400">
              {tool.error}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
