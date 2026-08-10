import { z } from 'zod'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { downloadManager } from '../../downloads/manager'
import { supabaseAdmin } from '../../supabase/client'
import { AppError } from '../../../types/common'

const DownloadSchema = z.object({
  url: z.string().url(),
  conversationId: z.string().uuid().optional(),
})

const StatusSchema = z.object({ downloadId: z.string().uuid() })

export class DownloadMCPAdapter implements MCPProvider {
  readonly name = 'download'
  readonly version = '1.0.0'
  readonly category = 'download' as const

  tools(): MCPTool[] {
    return [
      {
        name: 'download.fetch',
        description: 'Download a remote file by URL and store it as an artifact',
        category: 'download',
        version: '1.0.0',
        inputSchema: DownloadSchema,
      },
      {
        name: 'download.status',
        description: 'Get status of a download artifact by its artifact ID',
        category: 'download',
        version: '1.0.0',
        inputSchema: StatusSchema,
      },
    ]
  }

  async execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown> {
    switch (toolName) {
      case 'download.fetch': return this.fetch(DownloadSchema.parse(input), ctx)
      case 'download.status': return this.status(StatusSchema.parse(input), ctx)
      default: throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  private async fetch(input: z.infer<typeof DownloadSchema>, ctx: MCPContext) {
    const result = await downloadManager.download(input.url, ctx.tenantId)

    // Upload the downloaded file into Supabase Storage (downloads bucket)
    const storagePath = `tenants/${ctx.tenantId}/users/${ctx.userId}/downloads/${Date.now()}_${result.filename}`

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('downloads')
      .upload(storagePath, require('fs').createReadStream(result.localPath), {
        contentType: result.contentType,
        duplex: 'half',
      } as any)

    if (uploadErr) throw new AppError(`Storage upload failed: ${uploadErr.message}`, 500, 'STORAGE_ERROR')

    // Create artifact record
    const { data: artifact, error: artErr } = await supabaseAdmin
      .from('artifacts')
      .insert({
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        conversation_id: input.conversationId ?? null,
        filename: result.filename,
        mime_type: result.contentType,
        size_bytes: result.sizeBytes,
        bucket: 'downloads',
        storage_path: storagePath,
        source_url: input.url,
      })
      .select()
      .single()

    if (artErr) throw new AppError('Failed to create artifact record', 500, 'DATABASE_ERROR')

    return { artifactId: artifact.id, filename: result.filename, sizeBytes: result.sizeBytes }
  }

  private async status(input: z.infer<typeof StatusSchema>, ctx: MCPContext) {
    const { data, error } = await supabaseAdmin
      .from('artifacts')
      .select('id, filename, mime_type, size_bytes, created_at')
      .eq('id', input.downloadId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .single()

    if (error || !data) throw new AppError('Download artifact not found', 404, 'NOT_FOUND')
    return data
  }
}
