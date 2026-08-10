import { randomUUID } from 'node:crypto'
import { BaseRepository } from './base.repo'
import { DatabaseError } from '../types/common'
import type { DbUser } from '../types/common'

export class UserRepo extends BaseRepository {
  async findById(id: string): Promise<DbUser | null> {
    const { data, error } = await this.db.from('users').select('*').eq('id', id).maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser | null
  }

  async findByClerkId(clerkUserId: string): Promise<DbUser | null> {
    const { data, error } = await this.db.from('users').select('*').eq('clerk_user_id', clerkUserId).maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser | null
  }

  async findByEmail(email: string): Promise<DbUser | null> {
    const { data, error } = await this.db.from('users').select('*').eq('email', email).maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser | null
  }

  async createFromClerk(clerkUserId: string, tenantId: string, email: string, role = 'admin'): Promise<DbUser> {
    const { data, error } = await this.db
      .from('users')
      .insert({ id: randomUUID(), clerk_user_id: clerkUserId, tenant_id: tenantId, email, role })
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser
  }

  async linkClerkId(userId: string, clerkUserId: string): Promise<DbUser> {
    const { data, error } = await this.db
      .from('users')
      .update({ clerk_user_id: clerkUserId })
      .eq('id', userId)
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser
  }

  async create(id: string, tenantId: string, email: string, role = 'admin'): Promise<DbUser> {
    const { data, error } = await this.db
      .from('users')
      .insert({ id, tenant_id: tenantId, email, role })
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbUser
  }

  async findByTenant(tenantId: string): Promise<DbUser[]> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbUser[]
  }

  async updateRole(id: string, role: string): Promise<void> {
    const { error } = await this.db.from('users').update({ role }).eq('id', id)
    if (error) throw new DatabaseError(error.message)
  }
}
