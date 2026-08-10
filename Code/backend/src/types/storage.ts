import { z } from 'zod'

export const ALLOWED_MIME_TYPES = new Set([
  'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/pdf',
  'application/zip', 'application/x-tar',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm',
  'application/octet-stream',
  'text/x-python', 'text/javascript', 'text/typescript',
])

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

export type StorageBucket = 'artifacts' | 'media' | 'snapshots' | 'uploads'

export interface UploadResult {
  storagePath: string
  artifactId: string
  mimeType: string
  sizeBytes: number
}

export const SignedUrlQuerySchema = z.object({
  ttl: z.coerce.number().int().min(60).max(3600).default(900),
})
