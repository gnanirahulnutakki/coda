import * as fs from 'fs'
import * as yaml from 'js-yaml'
import prompts from 'prompts'
import { CONFIG_PATHS } from '../config/paths.js'
import { log, warn } from '../utils/logging.js'

export interface CcInitOptions {
  useYolo?: boolean
  useCoreToolset?: boolean
  noUseCoreToolset?: boolean
  project?: boolean
}

export async function handleCcInit(args: string[]): Promise<void> {
  const options: CcInitOptions = {}

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: coda cc-init [options]')
    console.log('\nInitialize a new Coda configuration file')
    console.log('\nOptions:')
    console.log(
      '  --use-yolo               Accept all prompts automatically (use with caution)',
    )
    console.log('  --use-core-toolset       Enable core toolset')
    console.log('  --no-use-core-toolset    Disable core toolset')
    console.log(
      '  --project                Create config in current directory (.coda/config.yaml)',
    )
    console.log('  -h, --help               Show this help message')
    console.log('\nNotes:')
    console.log(
      '  - --use-core-toolset and --no-use-core-toolset are mutually exclusive',
    )
    process.exit(0)
  }

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--use-yolo':
        options.useYolo = true
        break
      case '--use-core-toolset':
        options.useCoreToolset = true
        break
      case '--no-use-core-toolset':
        options.noUseCoreToolset = true
        break
      case '--project':
        options.project = true
        break
      default:
        if (arg && arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`)
          process.exit(1)
        }
    }
  }

  // Validate mutually exclusive options

  if (options.useCoreToolset && options.noUseCoreToolset) {
    console.error(
      'Error: --use-core-toolset and --no-use-core-toolset are mutually exclusive',
    )
    process.exit(1)
  }

  // Prompt for yolo mode if not specified
  if (options.useYolo === undefined) {
    console.log('\n\x1b[33m⚠️  YOLO Mode Configuration\x1b[0m')
    console.log('\x1b[90mYOLO mode will:\x1b[0m')
    console.log('\x1b[90m• Skip ALL permission prompts (file edits, commands, etc.)\x1b[0m')
    console.log('\x1b[90m• Automatically accept trust prompts for directories\x1b[0m')
    console.log('\x1b[90m• Let AI make changes without your review\x1b[0m')
    console.log('\x1b[90m• Work well for automation and CI/CD pipelines\x1b[0m')
    
    const yoloResponse = await prompts(
      {
        type: 'confirm',
        name: 'useYolo',
        message:
          'Enable YOLO mode? (AI will execute ALL actions without asking)',
        initial: false,
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    options.useYolo = yoloResponse.useYolo
    
    if (options.useYolo) {
      console.log('\x1b[33m✓ YOLO mode enabled - AI will not ask for permissions\x1b[0m')
    } else {
      console.log('\x1b[32m✓ YOLO mode disabled - AI will ask before making changes\x1b[0m')
    }
  }

  // Prompt for toolset if none specified
  if (!options.useCoreToolset && !options.noUseCoreToolset) {
    const toolsetResponse = await prompts(
      {
        type: 'confirm',
        name: 'useCoreToolset',
        message: 'Would you like to enable the core toolset?',
        initial: true,
        hint: 'Includes MCP context7 tools for library documentation',
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    options.useCoreToolset = toolsetResponse.useCoreToolset
  }

  // Check if using --project without a global config
  if (options.project) {
    const globalConfigPath = CONFIG_PATHS.getConfigFilePath()
    if (!fs.existsSync(globalConfigPath)) {
      console.error(
        'Error: Cannot create project config without a global config.',
      )
      console.error(
        'Please run "coda cc-init" first to create a global configuration.',
      )
      process.exit(1)
    }
  }

  // Check if config file already exists
  const configPath = options.project
    ? '.coda/config.yaml'
    : CONFIG_PATHS.getConfigFilePath()

  if (fs.existsSync(configPath)) {
    console.error('Error: Configuration file already exists at ' + configPath)
    process.exit(1)
  }

  // Build config object
  const config: any = {}

  // Add yolo mode if requested
  if (options.useYolo) {
    config.yolo = true
  }

  // Ask for AI provider if not in project mode
  if (!options.project) {
    // Auto-detect available providers
    const { ProviderDetector } = await import('../utils/provider-detector.js')
    const availableProviders = await ProviderDetector.detectAvailableProviders()
    
    let choices = []
    if (availableProviders.includes('claude-code')) {
      choices.push({ title: 'Claude Code ✓', value: 'claude-code' })
    } else {
      choices.push({ title: 'Claude Code (not found)', value: 'claude-code', disabled: true })
    }
    
    if (availableProviders.includes('gemini')) {
      choices.push({ title: 'Gemini ✓', value: 'gemini' })
    } else {
      choices.push({ title: 'Gemini (not found)', value: 'gemini', disabled: true })
    }
    
    // If no providers found, still show the menu but with a warning
    if (availableProviders.length === 0) {
      warn('⚠️  No AI providers detected on your system')
      warn('   You can still configure one and install it later')
      choices = [
        { title: 'Claude Code', value: 'claude-code' },
        { title: 'Gemini', value: 'gemini' }
      ]
    }
    
    const providerResponse = await prompts(
      {
        type: 'select',
        name: 'provider',
        message: 'Which AI provider would you like to use?',
        choices: choices,
        initial: 0
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    config.provider = providerResponse.provider

    // Ask for custom path if needed
    const customPathResponse = await prompts(
      {
        type: 'text',
        name: 'customPath',
        message: `Enter custom path to ${providerResponse.provider} CLI (or press enter to use default):`,
        initial: ''
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    if (customPathResponse.customPath) {
      config.provider_path = customPathResponse.customPath
    }
  }

  // Add toolsets if requested
  if (options.useCoreToolset && !options.noUseCoreToolset) {
    config.toolsets = ['internal:core']
  }

  // Add empty roots list
  config.roots = []

  // Ensure config directory exists
  const configDir = options.project
    ? '.coda'
    : CONFIG_PATHS.getConfigDirectory()

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  // Write config file
  try {
    const yamlStr = yaml.dump(config, { noRefs: true, lineWidth: -1 })
    fs.writeFileSync(configPath, yamlStr, 'utf8')
    log(`✅ Created configuration file at ${configPath}`)

    if (options.useYolo) {
      warn('⚠️  YOLO mode enabled - all prompts will be automatically accepted')
    } else {
      log('✓ YOLO mode disabled - all prompts will require confirmation')
    }

    if (options.useCoreToolset) {
      log('✓ Core toolset enabled')
    }
  } catch (error) {
    console.error('Error writing configuration file:', error)
    process.exit(1)
  }
}
