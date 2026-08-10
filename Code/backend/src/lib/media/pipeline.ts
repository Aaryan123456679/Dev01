import { createReadStream, createWriteStream } from 'fs'
import { mkdir, stat, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { AppError } from '../../types/common'

const MEDIA_TMP_DIR = '/tmp/Dev01-media'

const IMAGE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
const VIDEO_TYPES = new Set(['.mp4', '.webm', '.mov', '.avi'])
const AUDIO_TYPES = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a'])

export type MediaKind = 'image' | 'video' | 'audio' | 'unknown'

export interface MediaMetadata {
  kind: MediaKind
  extension: string
  sizeBytes: number
  path: string
}

export interface TranscodeOptions {
  outputFormat?: string
  maxWidthPx?: number
}

export class MediaPipeline {
  async probe(filePath: string): Promise<MediaMetadata> {
    const ext = extname(filePath).toLowerCase()
    const stats = await stat(filePath)
    let kind: MediaKind = 'unknown'
    if (IMAGE_TYPES.has(ext)) kind = 'image'
    else if (VIDEO_TYPES.has(ext)) kind = 'video'
    else if (AUDIO_TYPES.has(ext)) kind = 'audio'
    return { kind, extension: ext, sizeBytes: stats.size, path: filePath }
  }

  async transcode(inputPath: string, _opts: TranscodeOptions = {}): Promise<string> {
    const meta = await this.probe(inputPath)
    if (meta.kind === 'unknown') throw new AppError('Unsupported media type for transcoding', 400, 'UNSUPPORTED_MEDIA')
    return inputPath
  }

  async thumbnail(inputPath: string, tenantId: string): Promise<string> {
    await mkdir(join(MEDIA_TMP_DIR, tenantId), { recursive: true })
    const meta = await this.probe(inputPath)
    const outPath = join(MEDIA_TMP_DIR, tenantId, `thumb_${Date.now()}${meta.extension}`)

    if (meta.kind === 'image') {
      await new Promise<void>((resolve, reject) => {
        const rs = createReadStream(inputPath)
        const ws = createWriteStream(outPath)
        rs.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
      })
      return outPath
    }

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(outPath)
      ws.end('', resolve)
      ws.on('error', reject)
    })
    return outPath
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
    } catch {
      // best-effort
    }
  }
}

export const mediaPipeline = new MediaPipeline()
