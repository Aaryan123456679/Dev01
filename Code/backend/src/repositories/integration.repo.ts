import { BaseRepository } from './base.repo'
import { DatabaseError } from '../types/common'

// Provider is now a free string — 'notion', 'figma', 'medium', etc.
// The DB constraint check has been removed in migration 012.
export type IntegrationProvider = string

export interface DbIntegrationConnection {
  id: string
  tenant_id: string
  user_id: string
  provider: IntegrationProvider
  access_token: string // ciphertext
  refresh_token: string | null
  account_label: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface UpsertConnectionInput {
  provider: IntegrationProvider
  accessToken: string // ciphertext
  refreshToken?: string | null
  accountLabel?: string | null
  metadata?: Record<string, unknown>
}

export class IntegrationRepo extends BaseRepository {
  async upsert(tenantId: string, userId: string, input: UpsertConnectionInput): Promise<DbIntegrationConnection> {
    const { data, error } = await this.db
      .from('integration_connections')
      .upsert(
        {
          tenant_id: tenantId,
          user_id: userId,
          provider: input.provider,
          access_token: input.accessToken,
          refresh_token: input.refreshToken ?? null,
          account_label: input.accountLabel ?? null,
          metadata: input.metadata ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,user_id,provider' },
      )
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbIntegrationConnection
  }

  async find(tenantId: string, userId: string, provider: IntegrationProvider): Promise<DbIntegrationConnection | null> {
    const { data, error } = await this.db
      .from('integration_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle()

    if (error) throw new DatabaseError(error.message)
    return (data as DbIntegrationConnection) ?? null
  }

  async listByUser(tenantId: string, userId: string): Promise<DbIntegrationConnection[]> {
    const { data, error } = await this.db
      .from('integration_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbIntegrationConnection[]
  }

  // Merge a patch into a connection's metadata (used to store user-defined
  // dynamic tools alongside the connector, not in the codebase).
  async mergeMetadata(
    tenantId: string,
    userId: string,
    provider: IntegrationProvider,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.find(tenantId, userId, provider)
    if (!existing) throw new DatabaseError(`No ${provider} connection to update`)
    const metadata = { ...(existing.metadata ?? {}), ...patch }
    const { error } = await this.db
      .from('integration_connections')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('provider', provider)
    if (error) throw new DatabaseError(error.message)
  }

  async remove(tenantId: string, userId: string, provider: IntegrationProvider): Promise<void> {
    const { error } = await this.db
      .from('integration_connections')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('provider', provider)

    if (error) throw new DatabaseError(error.message)
  }
}
