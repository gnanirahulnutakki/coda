import * as fs from 'fs'
import * as os from 'os'
import { ProviderDetector } from '../utils/provider-detector.js'
import { CONFIG_PATHS } from '../config/paths.js'
import { loadConfigFile } from '../config/loader.js'
import { detectAvailableProviders, AI_PROVIDERS, getProvider } from '../config/ai-providers.js'
import { log } from '../utils/logging.js'

export async function handleDoctorCommand(args: string[]): Promise<void> {
  console.log('\x1b[36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m')
  console.log('\x1b[36m║                      Coda Diagnostics                         ║\x1b[0m')
  console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n')

  // Check configuration
  console.log('\x1b[33m📁 Configuration:\x1b[0m')
  const configPath = CONFIG_PATHS.getConfigFilePath()
  const projectConfigPath = CONFIG_PATHS.getProjectConfigFilePath()

  if (fs.existsSync(configPath)) {
    console.log(`  ✓ Global config: ${configPath}`)
    try {
      const config = await loadConfigFile()
      console.log(`    - Provider: ${config.provider || 'claude-code'}`)
      if (config.provider_path) {
        console.log(`    - Custom path: ${config.provider_path}`)
      }
    } catch (e) {
      console.log(`    ✗ Error loading config: ${e.message}`)
    }
  } else {
    console.log(`  ✗ Global config not found: ${configPath}`)
    console.log(`    Run 'coda cc-init' to create one`)
  }

  if (fs.existsSync(projectConfigPath)) {
    console.log(`  ✓ Project config: ${projectConfigPath}`)
  }

  console.log('\n\x1b[33m🔍 AI Provider Detection:\x1b[0m')

  // Detect all available providers
  const detected = detectAvailableProviders()
  const installedIds = new Set(detected.map((d) => d.provider.id))

  // Group by category
  const nativeCli = Object.values(AI_PROVIDERS).filter((p) => p.category === 'native-cli')
  const ideExtension = Object.values(AI_PROVIDERS).filter((p) => p.category === 'ide-extension')
  const enterprise = Object.values(AI_PROVIDERS).filter((p) => p.category === 'enterprise')

  const showProviderStatus = (provider: any) => {
    const command = provider.detectCommand()
    if (command) {
      console.log(`  ✓ ${provider.name}: ${command}`)
      if (provider.features) {
        console.log(`    Features: ${provider.features.join(', ')}`)
      }
    } else {
      console.log(`  ✗ ${provider.name}: Not installed`)
      console.log(`    Install: ${provider.installInstructions}`)
    }
  }

  console.log('\n  Native CLI Tools:')
  nativeCli.forEach(showProviderStatus)

  if (ideExtension.length > 0) {
    console.log('\n  IDE Extensions (with CLI):')
    ideExtension.forEach(showProviderStatus)
  }

  if (enterprise.length > 0) {
    console.log('\n  Enterprise Tools:')
    enterprise.forEach(showProviderStatus)
  }

  console.log(
    `\n  Summary: ${detected.length} of ${Object.keys(AI_PROVIDERS).length} providers installed`,
  )

  // Environment variables
  console.log('\n\x1b[33m🌍 Environment:\x1b[0m')
  console.log(`  Platform: ${process.platform}`)
  console.log(`  Node.js: ${process.version}`)
  console.log(`  Home: ${os.homedir()}`)
  const pathSeparator = process.platform === 'win32' ? ';' : ':'
  console.log(
    `  PATH: ${process.env.PATH?.split(pathSeparator).slice(0, 3).join(pathSeparator)}...`,
  )

  if (process.env.CLAUDE_APP_PATH) {
    console.log(`  CLAUDE_APP_PATH: ${process.env.CLAUDE_APP_PATH}`)
  }
  if (process.env.GEMINI_APP_PATH) {
    console.log(`  GEMINI_APP_PATH: ${process.env.GEMINI_APP_PATH}`)
  }

  // Recommendations
  console.log('\n\x1b[33m💡 Recommendations:\x1b[0m')

  try {
    const config = await loadConfigFile()
    const currentProviderId = config.provider || 'claude-code'
    const currentProvider = getProvider(currentProviderId)

    if (currentProvider) {
      const command = currentProvider.detectCommand()
      if (!command) {
        console.log(`  ⚠️  Current provider '${currentProvider.name}' is not installed`)
        console.log(`     ${currentProvider.installInstructions}`)
        console.log(`\n     Or switch to an installed provider:`)
        console.log(`     coda switch`)
      } else {
        console.log(`  ✅ Your setup looks good! ${currentProvider.name} found at: ${command}`)
      }
    } else {
      console.log(`  ⚠️  Unknown provider '${currentProviderId}' in config`)
      console.log(`     Run 'coda switch' to select a valid provider`)
    }

    // Suggest high-priority providers not installed
    const highPriorityMissing = Object.values(AI_PROVIDERS).filter(
      (p) => p.priority === 'high' && !installedIds.has(p.id),
    )

    if (highPriorityMissing.length > 0) {
      console.log('\n  📦 Recommended tools to install:')
      highPriorityMissing.forEach((p) => {
        console.log(`     - ${p.name}: ${p.installInstructions}`)
      })
    }
  } catch (e) {
    console.log('  ⚠️  No configuration found. Run: coda cc-init')
  }

  console.log()
}
