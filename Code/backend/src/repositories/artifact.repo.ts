import { TenantScopedRepository } from './base.repo'
import { DatabaseError } from '../types/common'
import type { DbArtifact } from '../types/common'

export class ArtifactRepo extends TenantScopedRepository<DbArtifact> {
  protected readonly tableName = 'artifacts'

  async create(payload: Omit<DbArtifact, 'id' | 'created_at'>): Promise<DbArtifact> {
    const { data, error } = await this.db
      .from('artifacts')
      .insert(payload)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbArtifact
  }

  async findByTenantUser(tenantId: string, userId: string): Promise<DbArtifact[]> {
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbArtifact[]
  }

  async findByConversationOwner(userId: string, tenantId: string): Promise<DbArtifact[]> {
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbArtifact[]
  }

  async findByIds(ids: string[], tenantId: string, userId: string): Promise<DbArtifact[]> {
    if (ids.length === 0) return []
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .in('id', ids)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbArtifact[]
  }

  async findBySandbox(sandboxId: string, tenantId: string): Promise<DbArtifact[]> {
    const { data, error } = await this.db
      .from('artifacts')
      .select('*')
      .eq('sandbox_id', sandboxId)
      .eq('tenant_id', tenantId)

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbArtifact[]
  }

  async deleteArtifact(id: string, tenantId: string): Promise<string> {
    const { data, error } = await this.db
      .from('artifacts')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('storage_path')
      .single()

    if (error) throw new DatabaseError(error.message)
    return (data as DbArtifact).storage_path
  }
}
