import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { log } from './logging.js'

export interface ProviderLocation {
  path: string
  source: 'custom' | 'env' | 'path' | 'homebrew' | 'npm-global' | 'default' | 'local'
  verified: boolean
}

/**
 * Comprehensive provider detection that checks multiple installation methods
 */
export class ProviderDetector {
  private static commonInstallPaths = {
    'claude-code': [
      // Homebrew installations
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',

      // npm global installations
      path.join(os.homedir(), '.npm', 'bin', 'claude'),
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude',

      // Local installations
      path.join(os.homedir(), '.claude', 'local', 'claude'),
      path.join(os.homedir(), '.claude', 'bin', 'claude'),

      // Windows paths
      path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),

      // macOS Applications
      '/Applications/Claude.app/Contents/MacOS/claude',
      path.join(os.homedir(), 'Applications', 'Claude.app', 'Contents', 'MacOS', 'claude'),
    ],
    gemini: [
      // Common installation paths for Gemini
      '/opt/homebrew/bin/gemini',
      '/usr/local/bin/gemini',
      path.join(os.homedir(), '.gemini', 'bin', 'gemini'),
      path.join(os.homedir(), '.local', 'bin', 'gemini'),
    ],
  }

  /**
   * Find all possible locations for a provider
   */
  static async findProviderLocations(
    provider: 'claude-code' | 'gemini',
    customPath?: string,
  ): Promise<ProviderLocation[]> {
    const locations: ProviderLocation[] = []
    const providerName = provider === 'claude-code' ? 'claude' : provider

    // 1. Check custom path
    if (customPath) {
      const verified = await this.verifyExecutable(customPath)
      locations.push({
        path: customPath,
        source: 'custom',
        verified,
      })
      if (verified) return locations // If custom path works, use it
    }

    // 2. Check environment variable
    const envVarName = provider === 'claude-code' ? 'CLAUDE_APP_PATH' : 'GEMINI_APP_PATH'
    const envPath = process.env[envVarName]
    if (envPath) {
      const verified = await this.verifyExecutable(envPath)
      locations.push({
        path: envPath,
        source: 'env',
        verified,
      })
      if (verified) return locations
    }

    // 3. Try system PATH
    try {
      const whichResult = execSync(`which ${providerName} 2>/dev/null`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()

      if (whichResult) {
        const verified = await this.verifyExecutable(whichResult)
        locations.push({
          path: whichResult,
          source: 'path',
          verified,
        })
        if (verified) return locations
      }
    } catch {
      // which command failed, continue
    }

    // 4. Try whereis on Unix systems
    if (process.platform !== 'win32') {
      try {
        const whereisResult = execSync(`whereis ${providerName} 2>/dev/null`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()

        const paths = whereisResult.split(':')[1]?.trim().split(' ') || []
        for (const p of paths) {
          if (p && p !== providerName && (await this.verifyExecutable(p))) {
            locations.push({
              path: p,
              source: 'path',
              verified: true,
            })
            return locations
          }
        }
      } catch {
        // whereis failed, continue
      }
    }

    // 5. Check Homebrew specifically
    if (process.platform === 'darwin') {
      const homebrewPaths = [`/opt/homebrew/bin/${providerName}`, `/usr/local/bin/${providerName}`]

      for (const brewPath of homebrewPaths) {
        if (await this.verifyExecutable(brewPath)) {
          locations.push({
            path: brewPath,
            source: 'homebrew',
            verified: true,
          })
          return locations
        }
      }
    }

    // 6. Check npm global installation
    try {
      const npmRoot = execSync('npm root -g 2>/dev/null', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()

      const npmBinPaths = [
        path.join(npmRoot, '.bin', providerName),
        path.join(npmRoot, '@anthropic-ai', 'claude-code', 'bin', 'claude'),
      ]

      for (const npmPath of npmBinPaths) {
        if (await this.verifyExecutable(npmPath)) {
          locations.push({
            path: npmPath,
            source: 'npm-global',
            verified: true,
          })
          return locations
        }
      }
    } catch {
      // npm command failed, continue
    }

    // 7. Check common installation paths
    const commonPaths = this.commonInstallPaths[provider] || []
    for (const commonPath of commonPaths) {
      if (await this.verifyExecutable(commonPath)) {
        locations.push({
          path: commonPath,
          source: 'default',
          verified: true,
        })
        return locations
      }
    }

    // 8. If nothing found, add unverified default location
    locations.push({
      path:
        provider === 'claude-code'
          ? path.join(os.homedir(), '.claude', 'local', 'claude')
          : path.join(os.homedir(), '.gemini', 'bin', 'gemini'),
      source: 'default',
      verified: false,
    })

    return locations
  }

  /**
   * Get the best provider path
   */
  static async getBestProviderPath(
    provider: 'claude-code' | 'gemini',
    customPath?: string,
    debug = false,
  ): Promise<string> {
    const locations = await this.findProviderLocations(provider, customPath)

    if (debug) {
      log(`※ Searching for ${provider} provider...`)
      locations.forEach((loc) => {
        log(`  ${loc.verified ? '✓' : '✗'} ${loc.source}: ${loc.path}`)
      })
    }

    // Find first verified location
    const verified = locations.find((loc) => loc.verified)
    if (verified) {
      if (debug) {
        log(`※ Found ${provider} at: ${verified.path} (source: ${verified.source})`)
      }
      return verified.path
    }

    // If no verified location, throw helpful error
    const providerName = provider === 'claude-code' ? 'Claude Code' : 'Gemini'
    const envVarName = provider === 'claude-code' ? 'CLAUDE_APP_PATH' : 'GEMINI_APP_PATH'

    throw new Error(
      `${providerName} CLI not found. Please ensure ${providerName} is installed.\n\n` +
        `Searched locations:\n` +
        locations.map((loc) => `  - ${loc.source}: ${loc.path}`).join('\n') +
        `\n\nTo fix this:\n` +
        `1. Install ${providerName} CLI if not already installed\n` +
        `2. Add it to your PATH, or\n` +
        `3. Set ${envVarName} environment variable to the full path, or\n` +
        `4. Specify the path in your config file with 'provider_path'`,
    )
  }

  /**
   * Verify if a path is a valid executable
   */
  private static async verifyExecutable(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false
      }

      const stats = fs.statSync(filePath)
      if (!stats.isFile()) {
        return false
      }

      // On Windows, check for .exe, .cmd, or .bat extensions
      if (process.platform === 'win32') {
        const ext = path.extname(filePath).toLowerCase()
        if (!['.exe', '.cmd', '.bat', ''].includes(ext)) {
          return false
        }
      }

      // Check if executable
      fs.accessSync(filePath, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  /**
   * Auto-detect which provider is available on the system
   */
  static async detectAvailableProviders(): Promise<Array<'claude-code' | 'gemini'>> {
    const available: Array<'claude-code' | 'gemini'> = []

    try {
      await this.getBestProviderPath('claude-code')
      available.push('claude-code')
    } catch {
      // Claude not available
    }

    try {
      await this.getBestProviderPath('gemini')
      available.push('gemini')
    } catch {
      // Gemini not available
    }

    return available
  }
}
