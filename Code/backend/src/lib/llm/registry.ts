import { ProviderError } from '../../types/common'
import type { LLMProvider } from './types'

export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>()
  private defaultName = 'gemini'

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider)
  }

  get(name: string): LLMProvider {
    const provider = this.providers.get(name)
    if (!provider) throw new ProviderError(`LLM provider '${name}' not registered`)
    return provider
  }

  getDefault(): LLMProvider {
    return this.get(this.defaultName)
  }

  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new ProviderError(`Cannot set default: LLM provider '${name}' not registered`)
    }
    this.defaultName = name
  }

  list(): string[] {
    return Array.from(this.providers.keys())
  }
}

export const llmRegistry = new LLMProviderRegistry()
