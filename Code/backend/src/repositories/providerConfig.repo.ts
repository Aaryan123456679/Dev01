import { BaseRepository } from './base.repo'
import { DatabaseError } from '../types/common'

// Provider is now a free string (migration 012 removed the check constraint).
// Used for OAuth-based connectors that need a client_id/client_secret pair
// configured at the tenant level (e.g. Notion). Simple API-key connectors
// store credentials directly in integration_connections and don't use this table.
export interface DbProviderAppConfig {
  id: string
  tenant_id: string
  provider: string
  client_id: string
  client_secret: string // ciphertext
  redirect_uri: string
  created_at: string
  updated_at: string
}

export class ProviderConfigRepo extends BaseRepository {
  async get(tenantId: string, provider: string): Promise<DbProviderAppConfig | null> {
    const { data, error } = await this.db
      .from('provider_app_configs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
      .maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return (data as DbProviderAppConfig) ?? null
  }

  async upsert(
    tenantId: string,
    provider: string,
    input: { clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<DbProviderAppConfig> {
    const { data, error } = await this.db
      .from('provider_app_configs')
      .upsert(
        {
          tenant_id: tenantId,
          provider,
          client_id: input.clientId,
          client_secret: input.clientSecret,
          redirect_uri: input.redirectUri,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,provider' },
      )
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as DbProviderAppConfig
  }

  async remove(tenantId: string, provider: string): Promise<void> {
    const { error } = await this.db
      .from('provider_app_configs')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('provider', provider)
    if (error) throw new DatabaseError(error.message)
  }
}
