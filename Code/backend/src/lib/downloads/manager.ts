import { createWriteStream } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { AppError } from '../../types/common'

const ALLOWED_PROTOCOLS = ['https:', 'http:']
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024 // 100 MB
const DOWNLOAD_TIMEOUT_MS = 30_000
const TMP_DIR = '/tmp/Dev01-downloads'

export interface DownloadResult {
  localPath: string
  filename: string
  contentType: string
  sizeBytes: number
}

export class DownloadManager {
  async download(url: string, tenantId: string): Promise<DownloadResult> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AppError('Invalid URL', 400, 'INVALID_URL')
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      throw new AppError(`Protocol not allowed: ${parsed.protocol}`, 400, 'INVALID_PROTOCOL')
    }

    await mkdir(join(TMP_DIR, tenantId), { recursive: true })

    const filename = parsed.pathname.split('/').filter(Boolean).pop() ?? 'download'
    const localPath = join(TMP_DIR, tenantId, `${Date.now()}_${filename}`)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } catch (err) {
      throw new AppError(`Download failed: ${(err as Error).message}`, 502, 'DOWNLOAD_FAILED')
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new AppError(`Remote server returned ${response.status}`, 502, 'UPSTREAM_ERROR')
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      throw new AppError('File exceeds 100 MB limit', 413, 'FILE_TOO_LARGE')
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'

    if (!response.body) throw new AppError('Empty response body', 502, 'EMPTY_RESPONSE')

    let sizeBytes = 0
    const writeStream = createWriteStream(localPath)

    const limitedReadable = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          sizeBytes += value.length
          if (sizeBytes > MAX_DOWNLOAD_BYTES) {
            reader.cancel()
            controller.error(new AppError('File exceeds 100 MB limit during download', 413, 'FILE_TOO_LARGE'))
            return
          }
          controller.enqueue(value)
        }
        controller.close()
      },
    })

    await pipeline(Readable.fromWeb(limitedReadable as any), writeStream)

    return { localPath, filename, contentType, sizeBytes }
  }
}

export const downloadManager = new DownloadManager()
