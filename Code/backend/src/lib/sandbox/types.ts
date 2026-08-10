import { AppError } from '../../types/common'

// ── State machine ─────────────────────────────────────────────────────────────

export enum SandboxState {
  CREATED          = 'CREATED',
  CONTEXT_INJECTED = 'CONTEXT_INJECTED',
  RUNNING          = 'RUNNING',
  COMPLETED        = 'COMPLETED',
  FAILED           = 'FAILED',
  TERMINATED       = 'TERMINATED',
  EXPIRED          = 'EXPIRED',
  SNAPSHOT_SAVED   = 'SNAPSHOT_SAVED',
}

// Valid state transitions. Key = current state, value = allowed next states.
export const VALID_TRANSITIONS: Readonly<Record<SandboxState, SandboxState[]>> = {
  [SandboxState.CREATED]:          [SandboxState.CONTEXT_INJECTED, SandboxState.TERMINATED],
  [SandboxState.CONTEXT_INJECTED]: [SandboxState.RUNNING,          SandboxState.TERMINATED],
  [SandboxState.RUNNING]:          [SandboxState.COMPLETED, SandboxState.FAILED, SandboxState.TERMINATED, SandboxState.EXPIRED],
  // COMPLETED/FAILED → RUNNING so a sandbox can run multiple commands
  // (e.g. install a missing library, then re-run the code).
  [SandboxState.COMPLETED]:        [SandboxState.RUNNING, SandboxState.SNAPSHOT_SAVED, SandboxState.TERMINATED],
  [SandboxState.FAILED]:           [SandboxState.RUNNING, SandboxState.TERMINATED],
  [SandboxState.TERMINATED]:       [],
  [SandboxState.EXPIRED]:          [SandboxState.TERMINATED],
  [SandboxState.SNAPSHOT_SAVED]:   [SandboxState.TERMINATED],
}

export class SandboxStateError extends AppError {
  constructor(from: SandboxState, to: SandboxState) {
    super(
      `Invalid sandbox state transition: ${from} → ${to}`,
      409,
      'SANDBOX_STATE_ERROR',
    )
  }
}

// ── Resource limits ───────────────────────────────────────────────────────────

export interface ResourceLimits {
  memoryMb: number
  cpuCores: number
  timeoutSeconds: number
  networkEnabled: boolean
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface SandboxProviderConfig {
  memoryMb: number
  timeoutSeconds: number
  networkEnabled: boolean
}

export interface SandboxProvider {
  readonly name: string
  create(config: SandboxProviderConfig): Promise<{ providerSandboxId: string }>
  execute(providerSandboxId: string, command: string, timeoutSeconds?: number): Promise<ExecResult>
  // Run a shell command (any language: compile/run, install toolchains, etc.).
  runCommand(providerSandboxId: string, command: string, timeoutSeconds?: number): Promise<ExecResult>
  writeFile(providerSandboxId: string, path: string, content: string): Promise<void>
  writeFileBytes(providerSandboxId: string, path: string, data: Uint8Array): Promise<void>
  readFile(providerSandboxId: string, path: string): Promise<string>
  listFiles(providerSandboxId: string, path?: string): Promise<string[]>
  close(providerSandboxId: string): Promise<void>
}
