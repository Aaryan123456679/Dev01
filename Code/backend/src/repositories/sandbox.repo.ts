import { TenantScopedRepository } from './base.repo'
import { DatabaseError, NotFoundError } from '../types/common'
import type { DbSandboxInstance } from '../types/common'
import type { SandboxState } from '../lib/sandbox/types'

export class SandboxRepo extends TenantScopedRepository<DbSandboxInstance> {
  protected readonly tableName = 'sandbox_instances'

  async findById(id: string, tenantId: string): Promise<DbSandboxInstance> {
    const { data, error } = await this.db
      .from('sandbox_instances')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (error) throw new DatabaseError(error.message)
    if (!data) throw new NotFoundError('sandbox_instances')
    return data as DbSandboxInstance
  }

  async create(
    payload: Omit<DbSandboxInstance, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbSandboxInstance> {
    const { data, error } = await this.db
      .from('sandbox_instances')
      .insert(payload)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbSandboxInstance
  }

  async updateState(
    id: string,
    state: SandboxState,
    extra?: Partial<DbSandboxInstance>,
  ): Promise<DbSandboxInstance> {
    const { data, error } = await this.db
      .from('sandbox_instances')
      .update({ state, updated_at: new Date().toISOString(), ...(extra ?? {}) })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbSandboxInstance
  }

  async countActive(tenantId: string, userId: string): Promise<number> {
    const { count, error } = await this.db
      .from('sandbox_instances')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .not('state', 'in', '(TERMINATED,EXPIRED,COMPLETED,FAILED)')

    if (error) throw new DatabaseError(error.message)
    return count ?? 0
  }

  async findExpired(): Promise<DbSandboxInstance[]> {
    const { data, error } = await this.db
      .from('sandbox_instances')
      .select('*')
      .lt('expires_at', new Date().toISOString())
      .not('state', 'in', '(TERMINATED,EXPIRED)')

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbSandboxInstance[]
  }
}
