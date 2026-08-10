import { TenantScopedRepository } from './base.repo'
import { DatabaseError, NotFoundError } from '../types/common'
import type { DbWorkflow, DbWorkflowStep } from '../types/common'

export class WorkflowRepo extends TenantScopedRepository<DbWorkflow> {
  protected readonly tableName = 'workflows'

  async create(payload: Omit<DbWorkflow, 'id' | 'created_at' | 'updated_at'>): Promise<DbWorkflow> {
    const { data, error } = await this.db
      .from('workflows')
      .insert(payload)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbWorkflow
  }

  async findById(id: string, tenantId: string): Promise<DbWorkflow> {
    const { data, error } = await this.db
      .from('workflows')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Workflow')
      throw new DatabaseError(error.message)
    }
    return data as DbWorkflow
  }

  async updateState(
    id: string,
    state: string,
    extra?: Partial<DbWorkflow>,
  ): Promise<void> {
    const { error } = await this.db
      .from('workflows')
      .update({ state, updated_at: new Date().toISOString(), ...(extra ?? {}) })
      .eq('id', id)

    if (error) throw new DatabaseError(error.message)
  }

  async updateStep(id: string, steps: DbWorkflowStep[]): Promise<void> {
    const { error } = await this.db
      .from('workflows')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new DatabaseError(error.message)
  }

  async findByTenantPaginated(
    tenantId: string,
    state?: string,
    limit = 20,
  ): Promise<DbWorkflow[]> {
    let query = this.db
      .from('workflows')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (state) query = query.eq('state', state)

    const { data, error } = await query
    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbWorkflow[]
  }
}
