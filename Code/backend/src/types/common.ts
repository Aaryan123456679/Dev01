import type { Context } from 'hono'

// ── Roles & Quotas ────────────────────────────────────────────────────────────

export type Role = 'admin' | 'power' | 'standard' | 'readonly'

export interface RoleQuota {
  maxSandboxes: number
  maxExecutionSeconds: number
  maxMemoryMb: number
  gpuAccess: boolean
  availableTools: string[]
}

export const ROLE_QUOTAS: Record<Role, RoleQuota> = {
  admin: {
    maxSandboxes: 8,
    maxExecutionSeconds: 300,
    maxMemoryMb: 512,
    gpuAccess: true,
    availableTools: ['*'],
  },
  power: {
    maxSandboxes: 4,
    maxExecutionSeconds: 120,
    maxMemoryMb: 256,
    gpuAccess: false,
    availableTools: ['llm.*', 'sandbox.*', 'storage.*', 'file.*'],
  },
  standard: {
    maxSandboxes: 1,
    maxExecutionSeconds: 30,
    maxMemoryMb: 128,
    gpuAccess: false,
    availableTools: ['llm.*', 'sandbox.create', 'sandbox.execute', 'sandbox.destroy'],
  },
  readonly: {
    maxSandboxes: 0,
    maxExecutionSeconds: 0,
    maxMemoryMb: 0,
    gpuAccess: false,
    availableTools: [],
  },
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 4,
  power: 3,
  standard: 2,
  readonly: 1,
}

// ── Tenant Context (attached by middleware) ───────────────────────────────────

export interface TenantContext {
  userId: string
  tenantId: string
  role: Role
  email: string
}

// ── Hono environment ──────────────────────────────────────────────────────────

export type HonoEnv = {
  Variables: {
    tenantCtx: TenantContext
    requestId: string
  }
}

export type AppContext = Context<HonoEnv>

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationParams {
  limit: number
  cursor?: string
}

export interface PaginatedResult<T> {
  data: T[]
  nextCursor?: string
  total?: number
}

// ── Database row types ────────────────────────────────────────────────────────

export interface DbTenant {
  id: string
  name: string
  plan_type: string
  created_at: string
  updated_at: string
}

export interface DbUser {
  id: string
  clerk_user_id: string | null
  tenant_id: string
  email: string
  role: string
  created_at: string
  updated_at: string
}

export interface DbSession {
  id: string
  user_id: string
  token_hash: string
  expires_at: string
  created_at: string
}

export interface DbConversation {
  id: string
  user_id: string
  tenant_id: string
  title: string | null
  messages: DbMessage[]
  created_at: string
  updated_at: string
}

export interface DbMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
  timestamp: string
}

export interface DbWorkflow {
  id: string
  tenant_id: string
  user_id: string
  conversation_id: string | null
  name: string
  state: string
  steps: DbWorkflowStep[]
  context_snapshot: unknown
  result: unknown
  error: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface DbWorkflowStep {
  id: string
  name: string
  tool: string
  input: unknown
  output?: unknown
  state: string
  error?: string
  started_at?: string
  completed_at?: string
  retry_count: number
}

export interface DbSandboxInstance {
  id: string
  tenant_id: string
  user_id: string
  workflow_id: string | null
  type: string
  state: string
  provider: string
  provider_sandbox_id: string | null
  resource_limits: Record<string, unknown>
  context_snapshot: unknown
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface DbArtifact {
  id: string
  tenant_id: string
  user_id: string
  sandbox_id: string | null
  workflow_id: string | null
  storage_path: string
  artifact_type: string
  mime_type: string | null
  size_bytes: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface DbMcpProvider {
  id: string
  tenant_id: string | null
  name: string
  category: string
  version: string
  config: Record<string, unknown>
  capabilities: unknown[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DbAuditLog {
  id: string
  tenant_id: string
  user_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

// ── Custom errors ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'AUTH_ERROR')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 422, 'VALIDATION_ERROR')
  }
}

export class QuotaError extends AppError {
  constructor(message = 'Quota exceeded') {
    super(message, 429, 'QUOTA_EXCEEDED')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(`Database error: ${message}`, 500, 'DATABASE_ERROR')
  }
}

export class ProviderError extends AppError {
  constructor(message: string) {
    super(message, 502, 'PROVIDER_ERROR')
  }
}
