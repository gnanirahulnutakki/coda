import * as fs from 'fs'
import * as yaml from 'js-yaml'
import prompts from 'prompts'
import { CONFIG_PATHS } from '../config/paths.js'
import { loadConfigFile } from '../config/loader.js'
import { ProviderDetector } from '../utils/provider-detector.js'
import { detectAvailableProviders, getProvider, AI_PROVIDERS } from '../config/ai-providers.js'
import { log, warn } from '../utils/logging.js'

export async function handleSwitchCommand(args: string[]): Promise<void> {
  // Check if a provider was specified directly
  const directProvider = args[0]

  // Validate direct provider if specified
  if (directProvider) {
    const provider = getProvider(directProvider)
    if (!provider) {
      console.error(`Unknown provider: ${directProvider}`)
      console.error('Available providers:')
      Object.values(AI_PROVIDERS).forEach((p) => {
        console.error(`  - ${p.id}: ${p.description}`)
      })
      process.exit(1)
    }
  }

  // Load current config
  const configPath = CONFIG_PATHS.getConfigFilePath()

  if (!fs.existsSync(configPath)) {
    console.error('No configuration file found.')
    console.error('Please run "coda cc-init" first to create a configuration.')
    process.exit(1)
  }

  const config = await loadConfigFile()
  const currentProvider = config.provider || 'claude-code'

  let newProvider: string

  if (directProvider) {
    newProvider = directProvider
  } else {
    // Auto-detect available providers using new system
    const detected = detectAvailableProviders()
    const availableIds = new Set(detected.map((d) => d.provider.id))

    // Build choices from all providers
    const choices = []

    // Group by priority for better UX
    const highPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'high')
    const mediumPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'medium')
    const lowPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'low')

    const addProviderChoice = (provider: any) => {
      const isAvailable = availableIds.has(provider.id)
      const isCurrent = currentProvider === provider.id

      choices.push({
        title: `${provider.name} ${isCurrent ? '(current)' : isAvailable ? '✓' : '(not installed)'}`,
        value: provider.id,
        description: provider.description,
        disabled: false, // Allow selecting even if not installed
      })
    }

    // Add providers in priority order
    highPriority.forEach(addProviderChoice)
    if (highPriority.length > 0 && mediumPriority.length > 0) {
      choices.push({ title: '─────', value: null, disabled: true })
    }
    mediumPriority.forEach(addProviderChoice)
    if (mediumPriority.length > 0 && lowPriority.length > 0) {
      choices.push({ title: '─────', value: null, disabled: true })
    }
    lowPriority.forEach(addProviderChoice)

    // Show warning if no providers installed
    if (detected.length === 0) {
      warn('⚠️  No AI providers detected on your system')
      warn('   You can still configure one and install it later')
    } else {
      log(`Found ${detected.length} installed provider(s)`)
    }

    const response = await prompts(
      {
        type: 'select',
        name: 'provider',
        message: 'Select AI provider:',
        choices: choices,
        initial: choices.findIndex((c) => c.value === currentProvider) || 0,
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    newProvider = response.provider
  }

  if (newProvider === currentProvider) {
    log(`Already using ${currentProvider}`)
    return
  }

  // Ask for custom path if needed
  let customPath: string | undefined

  const customPathResponse = await prompts(
    {
      type: 'text',
      name: 'customPath',
      message: `Enter custom path to ${newProvider} CLI (or press enter to use default):`,
      initial: '',
    },
    {
      onCancel: () => {
        process.exit(130)
      },
    },
  )

  if (customPathResponse.customPath) {
    customPath = customPathResponse.customPath
  }

  // Update config
  config.provider = newProvider
  if (customPath) {
    config.provider_path = customPath
  } else {
    delete config.provider_path
  }

  // Write updated config
  try {
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 })
    fs.writeFileSync(configPath, yamlStr, 'utf8')
    log(`✅ Switched to ${newProvider}`)

    // Try to verify the provider is available
    const provider = getProvider(newProvider)
    if (provider) {
      const command = provider.detectCommand()
      if (command) {
        log(`✓ Found ${provider.name} at: ${command}`)
      } else {
        warn(`⚠️  ${provider.name} not found.`)
        warn(`   Installation: ${provider.installInstructions}`)
      }
    }
  } catch (error) {
    console.error('Error updating configuration:', error)
    process.exit(1)
  }
}
