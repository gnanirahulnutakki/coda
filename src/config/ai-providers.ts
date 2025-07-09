import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { getPlatformPaths, getCommandExtension } from './platform-paths.js'

export interface AIProvider {
  id: string
  name: string
  description: string
  category: 'native-cli' | 'ide-extension' | 'enterprise'
  priority: 'high' | 'medium' | 'low'
  detectCommand: () => string | null
  installInstructions: string
  features?: string[]
  requiresAuth?: boolean
  configKeys?: string[]
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's CLI-based AI coding assistant",
    category: 'native-cli',
    priority: 'high',
    detectCommand: () => {
      const customPaths = [
        path.join(
          os.homedir(),
          '.claude',
          'local',
          'node_modules',
          '@anthropic-ai',
          'claude-code',
          'cli.js',
        ),
      ]
      return findCommandInPaths('claude', [...customPaths, ...getPlatformPaths('claude')])
    },
    installInstructions: 'Install from: https://claude.ai/download',
    features: ['chat', 'code-generation', 'file-editing'],
    requiresAuth: true,
    configKeys: ['anthropic_api_key'],
  },

  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: "Google's AI coding assistant",
    category: 'native-cli',
    priority: 'high',
    detectCommand: () => {
      const customPaths = [
        path.join(os.homedir(), '.gemini', 'bin', 'gemini' + getCommandExtension()),
      ]
      return findCommandInPaths('gemini', [...customPaths, ...getPlatformPaths('gemini')])
    },
    installInstructions: 'Install Gemini CLI from Google',
    features: ['chat', 'code-generation'],
    requiresAuth: true,
    configKeys: ['google_api_key'],
  },

  aider: {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal',
    category: 'native-cli',
    priority: 'high',
    detectCommand: () => findCommandInPath('aider'),
    installInstructions: 'Install with: pip install aider-install',
    features: ['git-aware', 'multi-file-editing', 'voice-input', 'auto-commit'],
    requiresAuth: true,
    configKeys: ['openai_api_key', 'anthropic_api_key'],
  },

  cline: {
    id: 'cline',
    name: 'Cline.ai',
    description: 'Autonomous AI coding agent',
    category: 'ide-extension',
    priority: 'high',
    detectCommand: () => findCommandInPath('cline'),
    installInstructions:
      'Install Cline extension in VS Code, or use CLI: npm install -g @cline/cli',
    features: ['autonomous', 'multi-step-tasks', 'file-management'],
    requiresAuth: true,
    configKeys: ['cline_api_key'],
  },

  'github-copilot': {
    id: 'github-copilot',
    name: 'GitHub Copilot CLI',
    description: "GitHub's AI pair programmer for the command line",
    category: 'native-cli',
    priority: 'medium',
    detectCommand: () => {
      // Check if gh is installed and has copilot extension
      try {
        const ghPath = findCommandInPath('gh')
        if (ghPath) {
          const extensions = execSync('gh extension list', { encoding: 'utf8' })
          if (extensions.includes('copilot')) {
            return 'gh copilot'
          }
        }
      } catch {
        // gh not found or error listing extensions
      }
      return null
    },
    installInstructions: 'Install GitHub CLI, then: gh extension install github/gh-copilot',
    features: ['explain', 'suggest', 'terminal-commands'],
    requiresAuth: true,
    configKeys: ['github_token'],
  },

  cody: {
    id: 'cody',
    name: 'Cody',
    description: "Sourcegraph's AI coding assistant",
    category: 'enterprise',
    priority: 'medium',
    detectCommand: () => findCommandInPath('cody'),
    installInstructions: 'Install from: https://sourcegraph.com/docs/cody/cli',
    features: ['context-aware', 'code-search', 'enterprise'],
    requiresAuth: true,
    configKeys: ['sourcegraph_token', 'sourcegraph_endpoint'],
  },

  'amazon-q': {
    id: 'amazon-q',
    name: 'Amazon Q Developer',
    description: 'AWS AI coding assistant (formerly CodeWhisperer)',
    category: 'enterprise',
    priority: 'low',
    detectCommand: () => findCommandInPath('aws-q'),
    installInstructions: 'Install AWS CLI and configure Amazon Q',
    features: ['aws-expertise', 'security-scanning', 'iac-generation'],
    requiresAuth: true,
    configKeys: ['aws_access_key', 'aws_secret_key'],
  },

  continue: {
    id: 'continue',
    name: 'Continue.dev',
    description: 'Open-source AI coding assistant',
    category: 'ide-extension',
    priority: 'medium',
    detectCommand: () => findCommandInPath('continue'),
    installInstructions: 'Install Continue extension or CLI from continue.dev',
    features: ['multi-llm', 'customizable', 'open-source'],
    requiresAuth: true,
    configKeys: ['continue_config'],
  },
}

/**
 * Find a command in the system PATH
 */
function findCommandInPath(command: string): string | null {
  try {
    if (process.platform === 'win32') {
      // Windows: use 'where' command
      const result = execSync(`where ${command}`, { encoding: 'utf8' }).trim()
      return result.split('\n')[0] || null // Return first match
    } else {
      // Unix: use 'which' command
      const result = execSync(`which ${command}`, { encoding: 'utf8' }).trim()
      return result || null
    }
  } catch {
    return null
  }
}

/**
 * Find a command in specific paths
 */
function findCommandInPaths(command: string, paths: string[]): string | null {
  // First try system PATH
  const systemPath = findCommandInPath(command)
  if (systemPath) return systemPath

  // Then try specific paths
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.accessSync(p, fs.constants.X_OK)
        return p
      } catch {
        // Not executable
      }
    }
  }

  return null
}

/**
 * Detect all available AI providers on the system
 */
export function detectAvailableProviders(): Array<{ provider: AIProvider; command: string }> {
  const available: Array<{ provider: AIProvider; command: string }> = []

  for (const provider of Object.values(AI_PROVIDERS)) {
    const command = provider.detectCommand()
    if (command) {
      available.push({ provider, command })
    }
  }

  return available.sort((a, b) => {
    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.provider.priority] - priorityOrder[b.provider.priority]
  })
}

/**
 * Get provider by ID
 */
export function getProvider(id: string): AIProvider | undefined {
  return AI_PROVIDERS[id]
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(id: string): boolean {
  const provider = AI_PROVIDERS[id]
  if (!provider) return false

  const command = provider.detectCommand()
  return command !== null
}

/**
 * Get the command for a provider
 */
export function getProviderCommand(id: string): string | null {
  const provider = AI_PROVIDERS[id]
  if (!provider) return null

  return provider.detectCommand()
}
