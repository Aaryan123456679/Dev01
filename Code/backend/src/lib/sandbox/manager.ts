import { SandboxRepo } from '../../repositories/sandbox.repo'
import { E2BSandboxProvider } from './providers/e2b'
import { DockerSandboxProvider } from './providers/docker'
import {
  SandboxState,
  VALID_TRANSITIONS,
  SandboxStateError,
} from './types'
import { ROLE_QUOTAS, QuotaError, NotFoundError } from '../../types/common'
import type { SandboxProvider, ExecResult, ResourceLimits } from './types'
import type { ContextSnapshot } from '../../types/context'
import type { DbSandboxInstance, Role } from '../../types/common'

function getProvider(): SandboxProvider {
  const name = process.env.SANDBOX_PROVIDER ?? 'e2b'
  if (name === 'docker') return new DockerSandboxProvider()
  return new E2BSandboxProvider()
}

export class SandboxManager {
  private repo = new SandboxRepo()
  private provider = getProvider()

  async create(
    tenantId: string,
    userId: string,
    role: Role,
    type: 'ephemeral' | 'dedicated' = 'ephemeral',
    workflowId?: string,
  ): Promise<DbSandboxInstance> {
    const quota = ROLE_QUOTAS[role]
    if (quota.maxSandboxes === 0) {
      throw new QuotaError('Your role does not allow sandbox creation')
    }

    const active = await this.repo.countActive(tenantId, userId)
    if (active >= quota.maxSandboxes) {
      throw new QuotaError(
        `Sandbox quota reached (${quota.maxSandboxes}). Destroy an existing sandbox first.`,
      )
    }

    const limits: ResourceLimits = {
      memoryMb: quota.maxMemoryMb,
      cpuCores: role === 'admin' ? 2 : 0.5,
      timeoutSeconds: quota.maxExecutionSeconds,
      networkEnabled: role === 'admin',
    }

    const { providerSandboxId } = await this.provider.create({
      memoryMb: limits.memoryMb,
      timeoutSeconds: limits.timeoutSeconds,
      networkEnabled: limits.networkEnabled,
    })

    const expiresAt = new Date(Date.now() + limits.timeoutSeconds * 1000 * 10).toISOString()

    return this.repo.create({
      tenant_id: tenantId,
      user_id: userId,
      workflow_id: workflowId ?? null,
      type,
      state: SandboxState.CREATED,
      provider: this.provider.name,
      provider_sandbox_id: providerSandboxId,
      resource_limits: limits as unknown as Record<string, unknown>,
      context_snapshot: null,
      expires_at: expiresAt,
    })
  }

  async injectContext(
    sandboxId: string,
    tenantId: string,
    snapshot: ContextSnapshot,
  ): Promise<DbSandboxInstance> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    this.assertTransition(sandbox, SandboxState.CONTEXT_INJECTED)

    // Serialize context as a JSON file inside the sandbox
    if (sandbox.provider_sandbox_id) {
      await this.provider.writeFile(
        sandbox.provider_sandbox_id,
        '/tmp/context.json',
        JSON.stringify(snapshot, null, 2),
      )
    }

    return this.repo.updateState(sandboxId, SandboxState.CONTEXT_INJECTED, { context_snapshot: snapshot })
  }

  async execute(
    sandboxId: string,
    tenantId: string,
    command: string,
    timeoutSeconds?: number,
  ): Promise<ExecResult> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    this.assertTransition(sandbox, SandboxState.RUNNING)

    await this.repo.updateState(sandboxId, SandboxState.RUNNING)

    try {
      if (!sandbox.provider_sandbox_id) {
        throw new Error('Sandbox has no provider ID — cannot execute')
      }

      const limits = sandbox.resource_limits as unknown as ResourceLimits
      const result = await this.provider.execute(
        sandbox.provider_sandbox_id,
        command,
        timeoutSeconds ?? limits.timeoutSeconds,
      )

      await this.repo.updateState(sandboxId, SandboxState.COMPLETED)
      return result
    } catch (err) {
      await this.repo.updateState(sandboxId, SandboxState.FAILED)
      throw err
    }
  }

  // Run a raw shell command in the sandbox (compile/run any language, install
  // toolchains). Kept lightweight — no state-machine churn per command.
  async runCommand(
    sandboxId: string,
    tenantId: string,
    command: string,
    timeoutSeconds?: number,
  ): Promise<ExecResult> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    if (!sandbox.provider_sandbox_id) throw new Error('Sandbox has no provider ID — cannot run')
    return this.provider.runCommand(sandbox.provider_sandbox_id, command, timeoutSeconds)
  }

  async collectArtifacts(sandboxId: string, tenantId: string): Promise<string[]> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    if (!sandbox.provider_sandbox_id) return []
    return this.provider.listFiles(sandbox.provider_sandbox_id, '/tmp/output')
  }

  // Write binary files into the sandbox filesystem (e.g. user attachments) so
  // generated code can open them by path.
  async writeFiles(
    sandboxId: string,
    tenantId: string,
    files: Array<{ path: string; data: Uint8Array }>,
  ): Promise<void> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    if (!sandbox.provider_sandbox_id) throw new Error('Sandbox has no provider ID')
    for (const f of files) {
      await this.provider.writeFileBytes(sandbox.provider_sandbox_id, f.path, f.data)
    }
  }

  async destroy(sandboxId: string, tenantId: string): Promise<void> {
    const sandbox = await this.requireSandbox(sandboxId, tenantId)
    const current = sandbox.state as SandboxState
    const allowed = VALID_TRANSITIONS[current]

    if (allowed.includes(SandboxState.TERMINATED)) {
      if (sandbox.provider_sandbox_id) {
        await this.provider.close(sandbox.provider_sandbox_id)
      }
      await this.repo.updateState(sandboxId, SandboxState.TERMINATED)
    }
  }

  async getStatus(sandboxId: string, tenantId: string): Promise<DbSandboxInstance> {
    return this.requireSandbox(sandboxId, tenantId)
  }

  private async requireSandbox(sandboxId: string, tenantId: string): Promise<DbSandboxInstance> {
    const sandbox = await this.repo.findById(sandboxId, tenantId)
    if (!sandbox) throw new NotFoundError('Sandbox')
    return sandbox
  }

  private assertTransition(sandbox: DbSandboxInstance, to: SandboxState): void {
    const current = sandbox.state as SandboxState
    const allowed = VALID_TRANSITIONS[current]
    if (!allowed.includes(to)) {
      throw new SandboxStateError(current, to)
    }
  }
}

export const sandboxManager = new SandboxManager()
