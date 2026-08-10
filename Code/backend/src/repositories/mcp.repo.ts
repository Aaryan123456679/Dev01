import { BaseRepository } from './base.repo'
import { DatabaseError, NotFoundError } from '../types/common'
import type { DbMcpProvider } from '../types/common'

export class McpProviderRepo extends BaseRepository {
  async findAll(tenantId?: string): Promise<DbMcpProvider[]> {
    let query = this.db
      .from('mcp_providers')
      .select('*')
      .eq('is_active', true)

    if (tenantId) {
      query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    } else {
      query = query.is('tenant_id', null)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbMcpProvider[]
  }

  async findById(id: string): Promise<DbMcpProvider> {
    const { data, error } = await this.db
      .from('mcp_providers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('MCP provider')
      throw new DatabaseError(error.message)
    }
    return data as DbMcpProvider
  }

  async create(
    payload: Omit<DbMcpProvider, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<DbMcpProvider> {
    const { data, error } = await this.db
      .from('mcp_providers')
      .insert(payload)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbMcpProvider
  }

  async deactivate(id: string): Promise<void> {
    const { error } = await this.db
      .from('mcp_providers')
      .update({ is_active: false })
      .eq('id', id)

    if (error) throw new DatabaseError(error.message)
  }
}
