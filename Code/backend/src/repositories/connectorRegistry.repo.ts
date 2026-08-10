import { BaseRepository } from './base.repo'
import { DatabaseError } from '../types/common'

export interface ConnectorCredentialSpec {
  name: string        // key stored in integration_connections (always 'access_token' for single-token)
  label: string       // UI label, e.g. "Figma Access Token"
  description: string // where to get it
  secret: boolean     // mask in UI
}

export interface ConnectorRegistryEntry {
  id: string
  normalized_name: string
  display_name: string
  connector_type: 'rest' | 'mcp-http'
  has_official_mcp: boolean
  base_url: string | null
  auth_type: 'bearer' | 'api-key' | 'oauth2' | 'basic'
  auth_header_name: string | null  // e.g. 'X-Figma-Token'
  auth_header_format: string | null // e.g. '{token}' or 'Bearer {token}'
  required_credentials: ConnectorCredentialSpec[]
  setup_steps: string[]
  documentation_url: string | null
  discovery_metadata: Record<string, unknown>
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export type UpsertRegistryInput = Omit<ConnectorRegistryEntry, 'id' | 'created_at' | 'updated_at'>

export class ConnectorRegistryRepo extends BaseRepository {
  async findByName(normalizedName: string): Promise<ConnectorRegistryEntry | null> {
    const { data, error } = await this.db
      .from('connector_registry')
      .select('*')
      .eq('normalized_name', normalizedName)
      .maybeSingle()
    if (error) throw new DatabaseError(error.message)
    return (data as ConnectorRegistryEntry) ?? null
  }

  async listAll(): Promise<ConnectorRegistryEntry[]> {
    const { data, error } = await this.db
      .from('connector_registry')
      .select('*')
      .order('display_name')
    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as ConnectorRegistryEntry[]
  }

  async upsert(input: UpsertRegistryInput): Promise<ConnectorRegistryEntry> {
    const { data, error } = await this.db
      .from('connector_registry')
      .upsert(
        { ...input, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'normalized_name' },
      )
      .select()
      .single()
    if (error) throw new DatabaseError(error.message)
    return data as ConnectorRegistryEntry
  }

  async remove(normalizedName: string): Promise<void> {
    const { error } = await this.db
      .from('connector_registry')
      .delete()
      .eq('normalized_name', normalizedName)
    if (error) throw new DatabaseError(error.message)
  }
}
