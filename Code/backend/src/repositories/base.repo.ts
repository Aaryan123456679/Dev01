import { supabaseAdmin } from '../lib/supabase/client'
import { DatabaseError, NotFoundError } from '../types/common'

export abstract class BaseRepository {
  protected readonly db = supabaseAdmin
}

export abstract class TenantScopedRepository<
  TRow extends { tenant_id: string },
> extends BaseRepository {
  protected abstract readonly tableName: string

  async findById(id: string, tenantId: string): Promise<TRow> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError(this.tableName)
      throw new DatabaseError(error.message)
    }
    return data as TRow
  }

  async findByTenant(tenantId: string): Promise<TRow[]> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as TRow[]
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new DatabaseError(error.message)
  }
}
