import { TenantScopedRepository } from './base.repo'
import { DatabaseError, NotFoundError } from '../types/common'
import type { DbConversation, DbMessage } from '../types/common'

export class ConversationRepo extends TenantScopedRepository<DbConversation> {
  protected readonly tableName = 'conversations'

  async create(
    tenantId: string,
    userId: string,
    title?: string | null,
  ): Promise<DbConversation> {
    const { data, error } = await this.db
      .from('conversations')
      .insert({ tenant_id: tenantId, user_id: userId, title: title ?? null, messages: [] })
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbConversation
  }

  async findByUser(tenantId: string, userId: string): Promise<DbConversation[]> {
    const { data, error } = await this.db
      .from('conversations')
      .select('id, title, created_at, updated_at, tenant_id, user_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    if (error) throw new DatabaseError(error.message)
    return (data ?? []) as DbConversation[]
  }

  async getWithMessages(id: string, tenantId: string): Promise<DbConversation> {
    const { data, error } = await this.db
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Conversation')
      throw new DatabaseError(error.message)
    }
    return data as DbConversation
  }

  async appendMessage(
    id: string,
    tenantId: string,
    message: DbMessage,
  ): Promise<DbConversation> {
    const conversation = await this.getWithMessages(id, tenantId)
    const messages = [...(conversation.messages ?? []), message]

    const { data, error } = await this.db
      .from('conversations')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error) throw new DatabaseError(error.message)
    return data as DbConversation
  }

  async updateTitle(id: string, tenantId: string, title: string): Promise<void> {
    const { error } = await this.db
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new DatabaseError(error.message)
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new DatabaseError(error.message)
  }

  // Permanently remove a conversation and everything tied to it (messages are
  // inline JSONB on the row; workflows, sandboxes, and artifacts are deleted in
  // FK-dependency order). Returns the storage paths of artifacts to purge.
  async hardDelete(id: string, tenantId: string): Promise<string[]> {
    // 1. Workflows for this conversation.
    const { data: wfs, error: wfErr } = await this.db
      .from('workflows').select('id').eq('conversation_id', id).eq('tenant_id', tenantId)
    if (wfErr) throw new DatabaseError(wfErr.message)
    const wfIds = (wfs ?? []).map((w: { id: string }) => w.id)

    // 2. Sandboxes belonging to those workflows.
    let sbIds: string[] = []
    if (wfIds.length) {
      const { data: sbs, error: sbErr } = await this.db
        .from('sandbox_instances').select('id').in('workflow_id', wfIds).eq('tenant_id', tenantId)
      if (sbErr) throw new DatabaseError(sbErr.message)
      sbIds = (sbs ?? []).map((s: { id: string }) => s.id)
    }

    // 3. Artifacts referenced via the conversation, its workflows, or sandboxes.
    const artifactMap = new Map<string, string>() // id → storage_path
    const collect = async (col: string, vals: string[]) => {
      if (!vals.length) return
      const { data } = await this.db
        .from('artifacts').select('id, storage_path').in(col, vals).eq('tenant_id', tenantId)
      for (const a of (data ?? []) as Array<{ id: string; storage_path: string }>) artifactMap.set(a.id, a.storage_path)
    }
    await collect('conversation_id', [id])
    await collect('workflow_id', wfIds)
    await collect('sandbox_id', sbIds)

    // 4. Delete in dependency order: artifacts → sandboxes → workflows → conversation.
    const artifactIds = [...artifactMap.keys()]
    if (artifactIds.length) {
      const { error } = await this.db.from('artifacts').delete().in('id', artifactIds)
      if (error) throw new DatabaseError(error.message)
    }
    if (sbIds.length) {
      const { error } = await this.db.from('sandbox_instances').delete().in('id', sbIds)
      if (error) throw new DatabaseError(error.message)
    }
    if (wfIds.length) {
      const { error } = await this.db.from('workflows').delete().in('id', wfIds)
      if (error) throw new DatabaseError(error.message)
    }
    const { error: convErr } = await this.db
      .from('conversations').delete().eq('id', id).eq('tenant_id', tenantId)
    if (convErr) throw new DatabaseError(convErr.message)

    return [...artifactMap.values()]
  }
}
