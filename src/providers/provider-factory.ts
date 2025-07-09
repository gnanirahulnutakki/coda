import { spawn, ChildProcess } from 'child_process'
import { AiderAdapter } from './aider-adapter.js'
import { getProvider, getProviderCommand } from '../config/ai-providers.js'
import type { AppConfig } from '../config/schemas.js'

export interface ProviderAdapter {
  start(args: string[], config: AppConfig): Promise<ChildProcess>
  supportsFeature(feature: string): boolean
  getName(): string
}

/**
 * Default adapter for providers that work with direct spawn
 */
class DefaultProviderAdapter implements ProviderAdapter {
  constructor(
    private providerId: string,
    private command: string,
  ) {}

  async start(args: string[], config: AppConfig): Promise<ChildProcess> {
    return spawn(this.command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    })
  }

  supportsFeature(feature: string): boolean {
    const provider = getProvider(this.providerId)
    return provider?.features?.includes(feature) ?? false
  }

  getName(): string {
    const provider = getProvider(this.providerId)
    return provider?.name ?? this.providerId
  }
}

/**
 * Adapter for Aider with enhanced integration
 */
class AiderProviderAdapter implements ProviderAdapter {
  private adapter: AiderAdapter

  constructor() {
    this.adapter = new AiderAdapter()
  }

  async start(args: string[], config: AppConfig): Promise<ChildProcess> {
    // Convert Coda config to Aider options
    const aiderOptions = AiderAdapter.applyCodeConfig(config)

    // Parse args - separate flags from message parts
    const messageParts: string[] = []

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '--model' && i + 1 < args.length) {
        aiderOptions.model = args[++i]
      } else if (arg === '--no-auto-commits') {
        aiderOptions.noAutoCommits = true
      } else if (arg === '--voice') {
        aiderOptions.voice = true
      } else if (!arg.startsWith('-')) {
        // Collect non-flag arguments as message parts
        messageParts.push(arg)
      }
    }

    // Join message parts if any
    if (messageParts.length > 0) {
      aiderOptions.message = messageParts.join(' ')
    }

    return this.adapter.start(aiderOptions)
  }

  supportsFeature(feature: string): boolean {
    const provider = getProvider('aider')
    return provider?.features?.includes(feature) ?? false
  }

  getName(): string {
    return 'Aider'
  }
}

/**
 * Adapter for GitHub Copilot CLI
 */
class GitHubCopilotAdapter implements ProviderAdapter {
  async start(args: string[], config: AppConfig): Promise<ChildProcess> {
    // GitHub Copilot uses 'gh copilot' command
    // Map common commands: 'explain', 'suggest', etc.
    let copilotArgs = args

    // If no subcommand provided, default to 'suggest'
    if (args.length === 0 || (args.length > 0 && !['explain', 'suggest'].includes(args[0]))) {
      copilotArgs = ['suggest', ...args]
    }

    return spawn('gh', ['copilot', ...copilotArgs], {
      stdio: 'inherit',
      env: process.env,
    })
  }

  supportsFeature(feature: string): boolean {
    const provider = getProvider('github-copilot')
    return provider?.features?.includes(feature) ?? false
  }

  getName(): string {
    return 'GitHub Copilot CLI'
  }
}

/**
 * Factory to create the appropriate adapter for a provider
 */
export class ProviderFactory {
  static createAdapter(providerId: string, customPath?: string): ProviderAdapter {
    const command = getProviderCommand(providerId) || customPath

    if (!command) {
      throw new Error(`Provider '${providerId}' not found or not installed`)
    }

    // Use specialized adapters for certain providers
    switch (providerId) {
      case 'aider':
        return new AiderProviderAdapter()

      case 'github-copilot':
        return new GitHubCopilotAdapter()

      // Add more specialized adapters as needed
      case 'cline':
      case 'cody':
      case 'amazon-q':
      case 'continue':
      default:
        // Use default adapter for providers that work with simple spawn
        return new DefaultProviderAdapter(providerId, command)
    }
  }

  /**
   * Check if a provider supports a specific feature
   */
  static supportsFeature(providerId: string, feature: string): boolean {
    try {
      const adapter = this.createAdapter(providerId)
      return adapter.supportsFeature(feature)
    } catch {
      return false
    }
  }
}
