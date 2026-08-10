'use client'

import { useEffect, useRef, useState } from 'react'
import type { Me } from '../lib/types'

interface UserMenuProps {
  me: Me | null
  onOpenSettings: () => void
  onLogout: () => void
}

export function UserMenu({ me, onOpenSettings, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const email = me?.user.email ?? 'Account'
  const initial = email.charAt(0).toUpperCase()

  const item = (label: string, onClick: () => void, testid: string, danger = false) => (
    <button
      onClick={() => { setOpen(false); onClick() }}
      data-testid={testid}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-800 ${
        danger ? 'text-red-400' : 'text-gray-300'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu-button"
        className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800 py-1 pl-1 pr-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="max-w-[140px] truncate">{email}</span>
        <span className="text-gray-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-gray-800 bg-gray-900 shadow-xl"
          data-testid="user-menu-dropdown">
          <div className="border-b border-gray-800 px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{email}</p>
            <p className="text-xs capitalize text-gray-500">
              {me?.user.tenantName ?? 'Workspace'} · {me?.user.plan ?? 'free'} plan
            </p>
          </div>
          {item('Edit profile', () => onOpenSettings(), 'menu-profile')}
          {item('Change plan', () => onOpenSettings(), 'menu-plan')}
          {item('Appearance', () => onOpenSettings(), 'menu-appearance')}
          <div className="border-t border-gray-800" />
          {item('Sign out', onLogout, 'menu-logout', true)}
        </div>
      )}
    </div>
  )
}
