'use client'

import { useEffect, useRef, useState } from 'react'
import type { Conversation } from '../lib/types'

interface ConversationPanelProps {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function ConversationPanel({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: ConversationPanelProps) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setDraft(conv.title ?? '')
    setMenuId(null)
  }

  const commitRename = (id: string) => {
    const title = draft.trim()
    if (title) onRename(id, title)
    setEditingId(null)
  }

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300">Conversations</h2>
        <button
          onClick={onNew}
          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          title="New conversation"
        >
          +
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 && (
          <p className="px-4 py-2 text-xs text-gray-600">No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <div key={conv.id} className="group relative">
            {editingId === conv.id ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitRename(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(conv.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                data-testid="rename-input"
                className="mx-2 my-1 w-[calc(100%-1rem)] rounded border border-blue-500 bg-gray-800 px-2 py-1 text-sm text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => onSelect(conv.id)}
                data-testid="conversation-item"
                className={`w-full px-4 py-2 pr-8 text-left text-sm transition-colors ${
                  activeId === conv.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
              >
                <span className="block truncate">{conv.title ?? 'Untitled conversation'}</span>
                <span className="mt-0.5 block text-xs text-gray-600">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </span>
              </button>
            )}

            {/* kebab menu trigger */}
            {editingId !== conv.id && (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuId(menuId === conv.id ? null : conv.id) }}
                data-testid="conversation-menu"
                className={`absolute right-1 top-2 rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-700 hover:text-white ${
                  menuId === conv.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Options"
              >
                ⋯
              </button>
            )}

            {menuId === conv.id && (
              <div
                ref={menuRef}
                className="absolute right-1 top-8 z-20 w-32 overflow-hidden rounded-md border border-gray-700 bg-gray-900 shadow-lg"
                data-testid="conversation-menu-dropdown"
              >
                <button
                  onClick={() => startRename(conv)}
                  data-testid="rename-action"
                  className="block w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-800"
                >
                  ✎ Rename
                </button>
                <button
                  onClick={() => { setMenuId(null); onDelete(conv.id) }}
                  data-testid="delete-action"
                  className="block w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-gray-800"
                >
                  🗑 Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  )
}
