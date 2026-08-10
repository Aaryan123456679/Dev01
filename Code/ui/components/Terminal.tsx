'use client'

import { useEffect, useRef } from 'react'
import type { WorkflowEvent } from '../lib/types'

interface TerminalLine {
  type: 'status' | 'output' | 'error' | 'system'
  text: string
  timestamp: string
}

interface TerminalProps {
  lines: TerminalLine[]
  isRunning: boolean
}

export function Terminal({ lines, isRunning }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const colorClass = (type: TerminalLine['type']) => {
    switch (type) {
      case 'error':  return 'text-red-400'
      case 'status': return 'text-blue-400'
      case 'system': return 'text-gray-500'
      default:       return 'text-gray-200'
    }
  }

  return (
    <div className="min-h-[300px] rounded-lg border border-gray-800 bg-gray-950 p-4 font-mono text-sm">
      {lines.length === 0 && !isRunning && (
        <span className="text-gray-600">— output will appear here —</span>
      )}
      {lines.map((line, i) => (
        <div key={i} className={`whitespace-pre-wrap ${colorClass(line.type)}`}>
          <span className="mr-2 select-none text-gray-700">{line.timestamp}</span>
          {line.text}
        </div>
      ))}
      {isRunning && (
        <span className="inline-block h-4 w-2 animate-pulse bg-blue-400" />
      )}
      <div ref={bottomRef} />
    </div>
  )
}

export function eventToLine(event: WorkflowEvent): TerminalLine | null {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
  switch (event.type) {
    case 'workflow.started':
      return { type: 'system',  text: `▶ Workflow started [${event.workflowId.slice(0, 8)}]`, timestamp: ts }
    case 'step.started':
      return { type: 'status',  text: `⚙ ${event.stepName} (${event.tool})`, timestamp: ts }
    case 'step.output':
      return { type: 'output',  text: event.chunk, timestamp: ts }
    case 'step.completed':
      return { type: 'status',  text: `✓ Step completed`, timestamp: ts }
    case 'step.failed':
      return { type: 'error',   text: `✗ Step failed: ${event.error}${event.willRetry ? ' (retrying…)' : ''}`, timestamp: ts }
    case 'workflow.completed':
      return { type: 'system',  text: `✓ Workflow completed`, timestamp: ts }
    case 'workflow.failed':
      return { type: 'error',   text: `✗ Workflow failed: ${event.error}`, timestamp: ts }
    case 'error':
      return { type: 'error',   text: `Error: ${event.error}`, timestamp: ts }
    default:
      return null
  }
}
