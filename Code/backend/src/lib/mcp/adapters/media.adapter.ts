import { z } from 'zod'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { mediaPipeline } from '../../media/pipeline'
import { supabaseAdmin } from '../../supabase/client'
import { AppError } from '../../../types/common'
import { createReadStream } from 'fs'

const ProbeSchema = z.object({ artifactId: z.string().uuid() })
const ThumbnailSchema = z.object({ artifactId: z.string().uuid() })
const TranscodeSchema = z.object({
  artifactId: z.string().uuid(),
  outputFormat: z.string().optional(),
  maxWidthPx: z.number().int().positive().optional(),
})

export class MediaMCPAdapter implements MCPProvider {
  readonly name = 'media'
  readonly version = '1.0.0'
  readonly category = 'media' as const

  tools(): MCPTool[] {
    return [
      {
        name: 'media.probe',
        description: 'Probe a media artifact to get its type and metadata',
        category: 'media',
        version: '1.0.0',
        inputSchema: ProbeSchema,
      },
      {
        name: 'media.thumbnail',
        description: 'Generate a thumbnail for an image/video artifact',
        category: 'media',
        version: '1.0.0',
        inputSchema: ThumbnailSchema,
      },
      {
        name: 'media.transcode',
        description: 'Transcode a media artifact to a different format (POC: returns original)',
        category: 'media',
        version: '1.0.0',
        inputSchema: TranscodeSchema,
      },
    ]
  }

  async execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown> {
    switch (toolName) {
      case 'media.probe': return this.probe(ProbeSchema.parse(input), ctx)
      case 'media.thumbnail': return this.thumbnail(ThumbnailSchema.parse(input), ctx)
      case 'media.transcode': return this.transcode(TranscodeSchema.parse(input), ctx)
      default: throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  private async resolveLocalPath(artifactId: string, tenantId: string): Promise<{ path: string; artifact: any }> {
    const { data: artifact, error } = await supabaseAdmin
      .from('artifacts')
      .select('*')
      .eq('id', artifactId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single()

    if (error || !artifact) throw new AppError('Artifact not found', 404, 'NOT_FOUND')

    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from(artifact.bucket)
      .download(artifact.storage_path)

    if (dlErr || !blob) throw new AppError('Failed to download artifact for processing', 500, 'STORAGE_ERROR')

    const tmp = `/tmp/media_${Date.now()}_${artifact.filename}`
    const buf = Buffer.from(await blob.arrayBuffer())
    await require('fs/promises').writeFile(tmp, buf)
    return { path: tmp, artifact }
  }

  private async probe(input: z.infer<typeof ProbeSchema>, ctx: MCPContext) {
    const { path, artifact } = await this.resolveLocalPath(input.artifactId, ctx.tenantId)
    const meta = await mediaPipeline.probe(path)
    await mediaPipeline.cleanup(path)
    return { ...meta, filename: artifact.filename }
  }

  private async thumbnail(input: z.infer<typeof ThumbnailSchema>, ctx: MCPContext) {
    const { path, artifact } = await this.resolveLocalPath(input.artifactId, ctx.tenantId)

    const thumbPath = await mediaPipeline.thumbnail(path, ctx.tenantId)
    await mediaPipeline.cleanup(path)

    const storagePath = `tenants/${ctx.tenantId}/users/${ctx.userId}/media/thumb_${Date.now()}_${artifact.filename}`

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('media')
      .upload(storagePath, createReadStream(thumbPath), { contentType: 'image/jpeg', duplex: 'half' } as any)

    await mediaPipeline.cleanup(thumbPath)
    if (uploadErr) throw new AppError(`Thumbnail upload failed: ${uploadErr.message}`, 500, 'STORAGE_ERROR')

    const { data: signed } = await supabaseAdmin.storage.from('media').createSignedUrl(storagePath, 900)
    return { thumbnailUrl: signed?.signedUrl ?? null, storagePath }
  }

  private async transcode(input: z.infer<typeof TranscodeSchema>, ctx: MCPContext) {
    const { path, artifact } = await this.resolveLocalPath(input.artifactId, ctx.tenantId)
    const outPath = await mediaPipeline.transcode(path, {
      outputFormat: input.outputFormat,
      maxWidthPx: input.maxWidthPx,
    })
    await mediaPipeline.cleanup(path)
    return { transcodedPath: outPath, originalFilename: artifact.filename, note: 'POC: transcoding is pass-through' }
  }
}
