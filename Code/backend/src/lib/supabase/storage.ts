import { supabaseAdmin } from './client'
import { ProviderError } from '../../types/common'
import type { StorageBucket } from '../../types/storage'

export class SupabaseStorageService {
  tenantPath(bucket: StorageBucket, tenantId: string, userId: string, filename: string): string {
    return `tenants/${tenantId}/users/${userId}/${bucket}/${filename}`
  }

  mediaTenantPath(tenantId: string, filename: string): string {
    return `tenants/${tenantId}/media/${filename}`
  }

  async upload(
    bucket: StorageBucket,
    path: string,
    data: Buffer | Uint8Array | string,
    mimeType: string,
  ): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, data, {
      contentType: mimeType,
      upsert: false,
    })
    if (error) throw new ProviderError(`Storage upload failed: ${error.message}`)
  }

  async download(bucket: StorageBucket, path: string): Promise<Buffer> {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
    if (error) throw new ProviderError(`Storage download failed: ${error.message}`)
    return Buffer.from(await data.arrayBuffer())
  }

  async signedUrl(bucket: StorageBucket, path: string, ttlSeconds = 900): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds)
    if (error) throw new ProviderError(`Failed to create signed URL: ${error.message}`)
    return data.signedUrl
  }

  async deleteObject(bucket: StorageBucket, path: string): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([path])
    if (error) throw new ProviderError(`Storage delete failed: ${error.message}`)
  }

  async listObjects(bucket: StorageBucket, prefix: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix)
    if (error) throw new ProviderError(`Storage list failed: ${error.message}`)
    return (data ?? []).map((f) => `${prefix}/${f.name}`)
  }
}

export const storageService = new SupabaseStorageService()
