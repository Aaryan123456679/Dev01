import { ConversationRepo } from '../../repositories/conversation.repo'
import { ArtifactRepo } from '../../repositories/artifact.repo'
import type { ContextSnapshot, Message } from '../../types/context'
import type { DbMessage } from '../../types/common'

export class ContextService {
  private conversationRepo = new ConversationRepo()
  // ArtifactRepo loaded lazily to avoid circular dep during init
  private get artifactRepo() { return new ArtifactRepo() }

  async buildSnapshot(
    conversationId: string,
    tenantId: string,
    userId: string,
  ): Promise<ContextSnapshot> {
    const conversation = await this.conversationRepo.getWithMessages(conversationId, tenantId)

    const artifacts = await this.artifactRepo.findByConversationOwner(userId, tenantId)
    const artifactRefs = artifacts.map((a) => a.storage_path)

    return {
      userId,
      tenantId,
      conversationId,
      messages: (conversation.messages ?? []).map(this.dbMessageToMessage),
      artifactRefs,
      capturedAt: new Date().toISOString(),
    }
  }

  async appendUserMessage(
    conversationId: string,
    tenantId: string,
    content: string,
  ): Promise<void> {
    const msg: DbMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    await this.conversationRepo.appendMessage(conversationId, tenantId, msg)
  }

  async appendAssistantMessage(
    conversationId: string,
    tenantId: string,
    content: string,
  ): Promise<void> {
    const msg: DbMessage = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    }
    await this.conversationRepo.appendMessage(conversationId, tenantId, msg)
  }

  private dbMessageToMessage(m: DbMessage): Message {
    return {
      role: m.role,
      content: m.content,
      toolCallId: m.tool_call_id,
      timestamp: m.timestamp,
    }
  }
}
