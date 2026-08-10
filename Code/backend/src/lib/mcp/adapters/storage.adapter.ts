import { z } from 'zod'
import { storageService } from '../../supabase/storage'
import { ArtifactRepo } from '../../../repositories/artifact.repo'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { MCPExecutionError } from '../types'

const UploadInputSchema = z.object({
  bucket: z.enum(['artifacts', 'media', 'snapshots', 'uploads']),
  path: z.string().min(1),
  content: z.string(),
  mimeType: z.string().default('application/octet-stream'),
})

const DownloadInputSchema = z.object({
  bucket: z.enum(['artifacts', 'media', 'snapshots', 'uploads']),
  path: z.string().min(1),
})

const SignInputSchema = z.object({
  bucket: z.enum(['artifacts', 'media', 'snapshots', 'uploads']),
  path: z.string().min(1),
  ttlSeconds: z.number().int().min(60).max(3600).default(900),
})

const DeleteInputSchema = z.object({
  bucket: z.enum(['artifacts', 'media', 'snapshots', 'uploads']),
  path: z.string().min(1),
})

const ListInputSchema = z.object({
  bucket: z.enum(['artifacts', 'media', 'snapshots', 'uploads']),
  prefix: z.string(),
})

export class StorageMCPAdapter implements MCPProvider {
  readonly name = 'supabase-storage'
  readonly category = 'storage' as const
  readonly version = '1.0.0'

  tools(): MCPTool[] {
    return [
      { name: 'storage.upload',   description: 'Upload content to storage',         category: 'storage', version: '1.0.0', inputSchema: UploadInputSchema   },
      { name: 'storage.download', description: 'Download content from storage',     category: 'storage', version: '1.0.0', inputSchema: DownloadInputSchema },
      { name: 'storage.sign',     description: 'Generate a signed download URL',    category: 'storage', version: '1.0.0', inputSchema: SignInputSchema     },
      { name: 'storage.delete',   description: 'Delete an object from storage',     category: 'storage', version: '1.0.0', inputSchema: DeleteInputSchema   },
      { name: 'storage.list',     description: 'List objects under a prefix',       category: 'storage', version: '1.0.0', inputSchema: ListInputSchema     },
    ]
  }

  async execute(toolName: string, input: unknown, _ctx: MCPContext): Promise<unknown> {
    switch (toolName) {
      case 'storage.upload': {
        const p = UploadInputSchema.parse(input)
        await storageService.upload(p.bucket, p.path, p.content, p.mimeType)
        return { path: p.path }
      }
      case 'storage.download': {
        const p = DownloadInputSchema.parse(input)
        const buf = await storageService.download(p.bucket, p.path)
        return { content: buf.toString('base64') }
      }
      case 'storage.sign': {
        const p = SignInputSchema.parse(input)
        const url = await storageService.signedUrl(p.bucket, p.path, p.ttlSeconds)
        return { signedUrl: url }
      }
      case 'storage.delete': {
        const p = DeleteInputSchema.parse(input)
        await storageService.deleteObject(p.bucket, p.path)
        return { deleted: true }
      }
      case 'storage.list': {
        const p = ListInputSchema.parse(input)
        const files = await storageService.listObjects(p.bucket, p.prefix)
        return { files }
      }
      default:
        throw new MCPExecutionError(`Unknown tool: ${toolName}`, toolName)
    }
  }
}
