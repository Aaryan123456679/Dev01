import { BaseRepository } from './base.repo'
import { DatabaseError, NotFoundError } from '../types/common'
import type { DbTenant } from '../types/common'

export class TenantRepo extends BaseRepository {
  async findById(id: string): Promise<DbTenant> {
    const { data, error } = await this.db.from('tenants').select('*').eq('id', id).single()
    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Tenant')
      throw new DatabaseError(error.message)
    }
    return data as DbTenant
  }

  async findByName(name: string): Promise<DbTenant | null> {
    const { data, error } = await this.db.from('tenants').select('*').eq('name', name).maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return data as DbTenant | null
  }

  async create(name: string, planType = 'free'): Promise<DbTenant> {
    const { data, error } = await this.db
      .from('tenants')
      .insert({ name, plan_type: planType })
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbTenant
  }

  async updatePlan(id: string, planType: string): Promise<DbTenant> {
    const { data, error } = await this.db
      .from('tenants')
      .update({ plan_type: planType })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbTenant
  }

  async updateName(id: string, name: string): Promise<DbTenant> {
    const { data, error } = await this.db
      .from('tenants')
      .update({ name })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbTenant
  }
}
