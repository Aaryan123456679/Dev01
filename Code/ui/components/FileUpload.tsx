'use client'

import { useRef, useState } from 'react'
import { extractText, isExtractable } from '../lib/extract'

interface FileUploadProps {
  onUploaded: (artifactId: string, filename: string) => void
}

export function FileUpload({ onUploaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Upload an arbitrary File to storage and return its artifact id.
  const uploadBlob = async (blob: File): Promise<string> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
    const w = window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }
    const token = await w.Clerk?.session?.getToken().catch(() => null) ?? null

    const formData = new FormData()
    formData.append('file', blob)
    const res = await fetch(`${apiUrl}/api/v1/storage/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Upload failed')
    }
    return (await res.json()).artifactId
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    setError(null)

    // 1. Try to read/parse the file in the browser first (Docling-style). If it
    //    yields text, upload only the extracted text.
    if (isExtractable(file)) {
      try {
        setStatus('Reading…')
        const { text, truncated } = await extractText(file)
        if (text.trim()) {
          setStatus('Uploading…')
          const textBlob = new File([text], `${file.name}.txt`, { type: 'text/plain' })
          const id = await uploadBlob(textBlob)
          onUploaded(id, file.name + (truncated ? ' (truncated)' : ''))
          setStatus(null)
          setBusy(false)
          return
        }
        // empty text → fall through to raw upload
      } catch {
        // extraction failed → fall through to raw upload
      }
    }

    // 2. Fallback: upload the original file as-is (the backend stores it and
    //    references it by name/type; text types are read server-side).
    try {
      setStatus('Uploading…')
      const id = await uploadBlob(file)
      onUploaded(id, file.name)
      setStatus(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        data-testid="attach-file"
        className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {busy ? (status ?? 'Working…') : '+ Attach file'}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 max-w-[160px] text-xs text-red-400">{error}</p>}
    </div>
  )
}
