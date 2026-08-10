import { supabaseAdmin } from '../supabase/client'
import { logger } from './logger'

export interface AuditEvent {
  tenantId: string
  userId: string
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

export class AuditService {
  async log(event: AuditEvent): Promise<void> {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      tenant_id: event.tenantId,
      user_id: event.userId,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId ?? null,
      metadata: event.metadata ?? null,
      ip_address: event.ipAddress ?? null,
    })

    if (error) {
      // Never throw from audit logging — log the failure and continue
      logger.error('Audit log insert failed', { error: error.message, action: event.action })
    }
  }
}

export const auditService = new AuditService()
