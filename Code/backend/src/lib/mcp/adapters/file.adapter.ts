import { z } from 'zod'
import type { MCPProvider, MCPTool, MCPContext } from '../types'
import { supabaseAdmin } from '../../supabase/client'
import { AppError } from '../../../types/common'

const ReadFileSchema = z.object({ artifactId: z.string().uuid() })
const ListFilesSchema = z.object({ conversationId: z.string().uuid().optional() })
const DeleteFileSchema = z.object({ artifactId: z.string().uuid() })

export class FileMCPAdapter implements MCPProvider {
  readonly name = 'file'
  readonly version = '1.0.0'
  readonly category = 'file' as const

  tools(): MCPTool[] {
    return [
      {
        name: 'file.read',
        description: 'Read artifact metadata and generate a signed download URL',
        category: 'file',
        version: '1.0.0',
        inputSchema: ReadFileSchema,
      },
      {
        name: 'file.list',
        description: 'List artifacts for the current tenant/user, optionally scoped to a conversation',
        category: 'file',
        version: '1.0.0',
        inputSchema: ListFilesSchema,
      },
      {
        name: 'file.delete',
        description: 'Soft-delete an artifact record (storage object deletion handled separately)',
        category: 'file',
        version: '1.0.0',
        inputSchema: DeleteFileSchema,
      },
    ]
  }

  async execute(toolName: string, input: unknown, ctx: MCPContext): Promise<unknown> {
    switch (toolName) {
      case 'file.read': return this.readFile(ReadFileSchema.parse(input), ctx)
      case 'file.list': return this.listFiles(ListFilesSchema.parse(input), ctx)
      case 'file.delete': return this.deleteFile(DeleteFileSchema.parse(input), ctx)
      default: throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  private async readFile(input: z.infer<typeof ReadFileSchema>, ctx: MCPContext) {
    const { data, error } = await supabaseAdmin
      .from('artifacts')
      .select('*')
      .eq('id', input.artifactId)
      .eq('tenant_id', ctx.tenantId)
      .is('deleted_at', null)
      .single()

    if (error || !data) throw new AppError('Artifact not found', 404, 'NOT_FOUND')

    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.storage_path, 900)

    if (signErr) throw new AppError('Failed to create signed URL', 500, 'STORAGE_ERROR')

    return { artifact: data, signedUrl: signedData.signedUrl }
  }

  private async listFiles(input: z.infer<typeof ListFilesSchema>, ctx: MCPContext) {
    let query = supabaseAdmin
      .from('artifacts')
      .select('id, filename, mime_type, size_bytes, created_at, conversation_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (input.conversationId) {
      query = query.eq('conversation_id', input.conversationId)
    }

    const { data, error } = await query
    if (error) throw new AppError('Failed to list artifacts', 500, 'DATABASE_ERROR')
    return { artifacts: data ?? [] }
  }

  private async deleteFile(input: z.infer<typeof DeleteFileSchema>, ctx: MCPContext) {
    const { error } = await supabaseAdmin
      .from('artifacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.artifactId)
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)

    if (error) throw new AppError('Failed to delete artifact', 500, 'DATABASE_ERROR')
    return { deleted: true, artifactId: input.artifactId }
  }
}
