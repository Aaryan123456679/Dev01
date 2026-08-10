'use client'

// Client-side document → text extraction (RAG ingestion). Runs entirely in the
// browser so only plain text is ever sent to the backend/model — the original
// binary never leaves the user's machine.

export interface ExtractResult {
  text: string
  pages?: number
  truncated: boolean
}

const MAX_CHARS = 100_000

function truncate(text: string): ExtractResult {
  const truncated = text.length > MAX_CHARS
  return {
    text: truncated ? text.slice(0, MAX_CHARS) + '\n…[truncated]' : text,
    truncated,
  }
}

async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist')
  // Worker is served locally from /public so this works offline.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ')
    parts.push(pageText)
  }
  const result = truncate(parts.join('\n\n'))
  result.pages = doc.numPages
  return result
}

async function extractDocx(file: File): Promise<ExtractResult> {
  // Browser build of mammoth.
  const mammoth = await import('mammoth/mammoth.browser')
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return truncate(value)
}

async function extractPlain(file: File): Promise<ExtractResult> {
  return truncate(await file.text())
}

const PLAIN_EXT = ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'xml', 'yaml', 'yml', 'tsv']

export function isExtractable(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (
    file.type === 'application/pdf' ||
    file.type.includes('wordprocessingml') ||
    ext === 'pdf' ||
    ext === 'docx' ||
    PLAIN_EXT.includes(ext) ||
    file.type.startsWith('text/')
  )
}

export async function extractText(file: File): Promise<ExtractResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (file.type === 'application/pdf' || ext === 'pdf') return extractPdf(file)
  if (file.type.includes('wordprocessingml') || ext === 'docx') return extractDocx(file)
  if (PLAIN_EXT.includes(ext) || file.type.startsWith('text/')) return extractPlain(file)

  throw new Error(`Unsupported file type for text extraction: ${file.name}`)
}
