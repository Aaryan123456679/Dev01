import Docker from 'dockerode'
import { ProviderError, AppError } from '../../../types/common'
import type { SandboxProvider, SandboxProviderConfig, ExecResult } from '../types'

// Docker provider is restricted to local development only.
// It must never run in production to avoid the host socket security risk.
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = 'docker'
  private client: Docker

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError(
        'DockerSandboxProvider cannot be used in production. Set SANDBOX_PROVIDER=e2b',
        500,
        'CONFIG_ERROR',
      )
    }
    this.client = new Docker()
  }

  async create(config: SandboxProviderConfig): Promise<{ providerSandboxId: string }> {
    try {
      const container = await this.client.createContainer({
        Image: 'python:3.12-slim',
        Cmd: ['tail', '-f', '/dev/null'],
        HostConfig: {
          Memory: config.memoryMb * 1024 * 1024,
          NanoCpus: 500_000_000,
          NetworkMode: config.networkEnabled ? 'bridge' : 'none',
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
        },
      })
      await container.start()
      return { providerSandboxId: container.id }
    } catch (err) {
      throw new ProviderError(`Docker sandbox creation failed: ${(err as Error).message}`)
    }
  }

  async execute(
    providerSandboxId: string,
    command: string,
    timeoutSeconds = 30,
  ): Promise<ExecResult> {
    try {
      const container = this.client.getContainer(providerSandboxId)
      // Write command to temp file to avoid shell injection via single-quote escape
      const tmpPath = `/tmp/cmd_${Date.now()}.py`
      const writeExec = await container.exec({
        Cmd: ['bash', '-c', `cat > ${tmpPath} << 'HEREDOC'\n${command}\nHEREDOC`],
        AttachStdout: true,
        AttachStderr: true,
      })
      await new Promise<void>((resolve) => {
        writeExec.start({}, () => resolve())
      })

      const exec = await container.exec({
        Cmd: ['python', tmpPath],
        AttachStdout: true,
        AttachStderr: true,
      })

      return await new Promise<ExecResult>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new ProviderError('Execution timeout')), timeoutSeconds * 1000)
        exec.start({}, (_err: any, stream: any) => {
          let stdout = ''
          let stderr = ''
          container.modem.demuxStream(stream, {
            write: (chunk: Buffer) => { stdout += chunk.toString() },
          }, {
            write: (chunk: Buffer) => { stderr += chunk.toString() },
          })
          stream.on('end', async () => {
            clearTimeout(timeout)
            const inspect = await exec.inspect()
            resolve({ stdout, stderr, exitCode: inspect.ExitCode ?? 0 })
          })
          stream.on('error', (e: Error) => { clearTimeout(timeout); reject(e) })
        })
      })
    } catch (err) {
      if (err instanceof ProviderError) throw err
      throw new ProviderError(`Docker execute failed: ${(err as Error).message}`)
    }
  }

  async writeFile(providerSandboxId: string, path: string, content: string): Promise<void> {
    const container = this.client.getContainer(providerSandboxId)
    const exec = await container.exec({
      Cmd: ['bash', '-c', `cat > ${path}`],
      AttachStdin: true,
      AttachStdout: true,
    })
    await new Promise<void>((resolve, reject) => {
      exec.start({ hijack: true, stdin: true }, (_err: any, stream: any) => {
        stream.write(content)
        stream.end()
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
    })
  }

  // Docker's execute already runs a shell command, so runCommand mirrors it.
  async runCommand(providerSandboxId: string, command: string, timeoutSeconds?: number): Promise<ExecResult> {
    return this.execute(providerSandboxId, command, timeoutSeconds)
  }

  async writeFileBytes(providerSandboxId: string, path: string, data: Uint8Array): Promise<void> {
    const container = this.client.getContainer(providerSandboxId)
    const exec = await container.exec({
      Cmd: ['bash', '-c', `cat > ${path}`],
      AttachStdin: true,
      AttachStdout: true,
    })
    await new Promise<void>((resolve, reject) => {
      exec.start({ hijack: true, stdin: true }, (_err: any, stream: any) => {
        stream.write(Buffer.from(data))
        stream.end()
        stream.on('finish', resolve)
        stream.on('error', reject)
      })
    })
  }

  async readFile(providerSandboxId: string, path: string): Promise<string> {
    const result = await this.execute(providerSandboxId, `cat ${path}`)
    return result.stdout
  }

  async listFiles(providerSandboxId: string, path = '/'): Promise<string[]> {
    const result = await this.execute(providerSandboxId, `find ${path} -maxdepth 2 -type f`)
    return result.stdout.split('\n').filter(Boolean)
  }

  async close(providerSandboxId: string): Promise<void> {
    try {
      const container = this.client.getContainer(providerSandboxId)
      await container.kill()
      await container.remove()
    } catch {
      // Best-effort
    }
  }
}
