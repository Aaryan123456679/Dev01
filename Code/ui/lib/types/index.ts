export interface Conversation {
  id: string
  title: string | null
  user_id: string
  tenant_id: string
  created_at: string
  updated_at: string
  messages?: Message[]
}

export type Plan = 'free' | 'standard' | 'power' | 'enterprise'

export interface ModelInfo {
  id: string
  label: string
  description: string
  dailyLimit: number
}

export interface ModelUsage extends ModelInfo {
  used: number
  remaining: number
}

export interface Me {
  user: {
    id: string
    email: string
    tenantId: string
    tenantName: string
    plan: Plan
    role: string
    createdAt: string
  }
  quota: {
    maxSandboxes: number
    maxExecutionSeconds: number
    maxMemoryMb: number
    gpuAccess: boolean
  }
}

export interface AttachedFile {
  id: string
  name: string
}

export interface ToolCall {
  id: string          // stepId
  name: string        // e.g. "Plan code"
  tool: string        // e.g. "llm.generate" or "sandbox"
  output: string      // accumulated step.output text
  status: 'running' | 'done' | 'failed'
  error?: string
}

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: string[]
  tools?: ToolCall[]
  status?: 'running' | 'done' | 'error'
  error?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: string
}

export interface Artifact {
  id: string
  storage_path: string
  artifact_type: string
  mime_type: string | null
  size_bytes: number | null
  metadata: Record<string, unknown>
  created_at: string
  signedUrl?: string
}

export type WorkflowEvent =
  | { type: 'workflow.started';   workflowId: string }
  | { type: 'step.started';       stepId: string; stepName: string; tool: string }
  | { type: 'step.output';        stepId: string; chunk: string }
  | { type: 'step.completed';     stepId: string; result: unknown }
  | { type: 'step.failed';        stepId: string; error: string; willRetry: boolean }
  | { type: 'workflow.completed'; workflowId: string; result: unknown }
  | { type: 'workflow.failed';    workflowId: string; error: string }
  | { type: 'error';              error: string }
