import * as os from 'node:os'
import * as path from 'path'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import { ProviderDetector } from '../utils/provider-detector.js'

/**
 * Centralized configuration paths management
 * Single source of truth for all configuration-related directories
 */
export const CONFIG_PATHS = {
  /**
   * Get the main configuration directory
   * Can be overridden by CODA_CONFIG_DIR environment variable
   */
  getConfigDirectory: (): string => {
    return (
      process.env.CODA_CONFIG_DIR ||
      path.join(os.homedir(), '.coda')
    )
  },

  /**
   * Get the logs directory path
   */
  getLogsDirectory: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'logs')
  },

  /**
   * Get the backups directory path
   */
  getBackupsDirectory: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'backups')
  },

  /**
   * Get the toolsets directory path
   */
  getToolsetsDirectory: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'toolsets')
  },

  /**
   * Get the rulesets directory path
   */
  getRulesetsDirectory: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'rulesets')
  },

  /**
   * Get the patterns directory path
   */
  getPatternsDirectory: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'patterns')
  },

  /**
   * Get the config file path
   */
  getConfigFilePath: (): string => {
    return path.join(CONFIG_PATHS.getConfigDirectory(), 'config.yaml')
  },

  /**
   * Get the project config file path
   * Located at .coda/config.yaml in the current working directory
   */
  getProjectConfigFilePath: (): string => {
    return path.join(process.cwd(), '.coda', 'config.yaml')
  },
} as const

/**
 * Environment variable names used in the application
 */
export const ENV_VARS = {
  CONFIG_DIR: 'CODA_CONFIG_DIR',
  APP_PATH: 'CLAUDE_APP_PATH',
  PATTERNS_PATH: 'CLAUDE_PATTERNS_PATH',
  HOME: 'HOME',
  PWD: 'PWD',
  FORCE_COLOR: 'FORCE_COLOR',
  TERM: 'TERM',
  MOCK_ENV: 'MOCK_ENV', // Used in tests
} as const

/**
 * Default paths for AI provider applications
 */
export const AI_PROVIDER_PATHS = {
  claude: {
    getDefaultAppPath: (): string => {
      return path.join(os.homedir(), '.claude', 'local', 'claude')
    },

    getDefaultCliPath: (): string => {
      return path.join(
        os.homedir(),
        '.claude',
        'local',
        'node_modules',
        '@anthropic-ai',
        'claude-code',
        'cli.js',
      )
    },

    getLocalDirectory: (): string => {
      return path.join(os.homedir(), '.claude', 'local')
    },
  },

  gemini: {
    getDefaultAppPath: (): string => {
      // Default gemini installation path - adjust based on actual Gemini CLI structure
      return path.join(os.homedir(), '.gemini', 'bin', 'gemini')
    },

    getDefaultCliPath: (): string => {
      return path.join(os.homedir(), '.gemini', 'bin', 'gemini')
    },

    getLocalDirectory: (): string => {
      return path.join(os.homedir(), '.gemini')
    },
  },

  /**
   * Find the AI provider command path with comprehensive detection
   * This remains synchronous for backward compatibility but uses smart detection
   * @param provider - The AI provider ID
   * @param customPath - Optional custom path to the provider CLI
   * @returns Path to provider executable or throws error if not found
   */
  findProviderCommand: (provider: string = 'claude-code', customPath?: string): string => {
    const providerName = provider === 'claude-code' ? 'claude' : provider
    const envVarName = provider === 'claude-code' ? 'CLAUDE_APP_PATH' : 'GEMINI_APP_PATH'
    const checkedPaths: string[] = []
    
    // 1. Check custom path first
    if (customPath) {
      checkedPaths.push(`Custom path: ${customPath}`)
      if (fs.existsSync(customPath)) {
        try {
          fs.accessSync(customPath, fs.constants.X_OK)
          return customPath
        } catch {
          // Not executable
        }
      }
    }
    
    // 2. Check environment variable
    if (process.env[envVarName]) {
      const envPath = process.env[envVarName]
      checkedPaths.push(`Environment ${envVarName}: ${envPath}`)
      if (fs.existsSync(envPath)) {
        try {
          fs.accessSync(envPath, fs.constants.X_OK)
          return envPath
        } catch {
          // Not executable
        }
      }
    }
    
    // 3. Try which command to find in PATH
    try {
      const whichResult = execSync(`which ${providerName} 2>/dev/null`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
      
      if (whichResult && fs.existsSync(whichResult)) {
        checkedPaths.push(`System PATH: ${whichResult}`)
        return whichResult
      }
    } catch {
      checkedPaths.push(`System PATH: not found`)
    }
    
    // 4. Check common installation locations
    const commonPaths = provider === 'claude-code' ? [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      path.join(os.homedir(), '.npm', 'bin', 'claude'),
      path.join(os.homedir(), '.claude', 'local', 'claude'),
      path.join(os.homedir(), '.claude', 'bin', 'claude'),
      '/Applications/Claude.app/Contents/MacOS/claude',
    ] : [
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
      path.join(os.homedir(), '.gemini', 'bin', 'gemini'),
    ]
    
    for (const commonPath of commonPaths) {
      if (fs.existsSync(commonPath)) {
        try {
          fs.accessSync(commonPath, fs.constants.X_OK)
          checkedPaths.push(`Found at: ${commonPath}`)
          return commonPath
        } catch {
          checkedPaths.push(`Not executable: ${commonPath}`)
        }
      }
    }
    
    // If all methods fail, throw helpful error
    throw new Error(
      `${provider} CLI not found. Please ensure ${provider} is installed.\n\n` +
      `Searched locations:\n` +
      checkedPaths.map(p => `  - ${p}`).join('\n') +
      `\n\nTo fix this:\n` +
      `1. Install ${provider} CLI if not already installed\n` +
      `2. Add it to your PATH, or\n` +
      `3. Set ${envVarName} environment variable to the full path, or\n` +
      `4. Specify the path in your config file with 'provider_path'`
    )
  },
} as const

// Legacy export for backward compatibility
export const CLAUDE_PATHS = {
  getDefaultAppPath: AI_PROVIDER_PATHS.claude.getDefaultAppPath,
  getDefaultCliPath: AI_PROVIDER_PATHS.claude.getDefaultCliPath,
  getLocalDirectory: AI_PROVIDER_PATHS.claude.getLocalDirectory,
  findClaudeCommand: () => AI_PROVIDER_PATHS.findProviderCommand('claude-code'),
} as const
