import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { CONFIG_PATHS } from '../config/paths.js'
import { PresetManager } from './preset-manager.js'
import { detectAvailableProviders, AI_PROVIDERS } from '../config/ai-providers.js'
import type { AppConfig } from '../config/schemas.js'

export interface WizardOptions {
  interactive?: boolean
  useDefaults?: boolean
  preset?: string
}

export class ConfigWizard {
  private rl: readline.Interface | null = null
  private presetManager: PresetManager

  constructor() {
    this.presetManager = new PresetManager()
  }

  /**
   * Run the configuration wizard
   */
  async runWizard(options: WizardOptions = {}): Promise<AppConfig> {
    const config: Partial<AppConfig> = {}

    if (options.preset) {
      // Start with preset configuration
      const preset = this.presetManager.getPreset(options.preset)
      if (preset) {
        Object.assign(config, preset.config)
        console.log(`\n📦 Starting with preset: ${preset.name}`)
        console.log(`   ${preset.description}\n`)
      } else {
        console.warn(`⚠️  Preset '${options.preset}' not found, starting with defaults\n`)
      }
    }

    if (options.useDefaults) {
      // Use all defaults
      return this.applyDefaults(config)
    }

    if (!options.interactive) {
      // Non-interactive mode with sensible defaults
      return this.applyDefaults(config)
    }

    // Interactive mode
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      console.log('\n🧙 Welcome to the Coda Configuration Wizard!\n')
      console.log('This wizard will help you set up your configuration.')
      console.log('Press Enter to accept the default value shown in [brackets].\n')

      // Basic settings
      config.provider = await this.askProvider(config.provider)

      // Safety settings
      console.log('\n--- Safety Settings ---')
      config.yolo = await this.askYesNo(
        'Enable YOLO mode (auto-accept all prompts)?',
        config.yolo ?? false,
      )

      if (config.yolo) {
        config.dangerously_suppress_yolo_confirmation = await this.askYesNo(
          'Suppress YOLO mode confirmation?',
          config.dangerously_suppress_yolo_confirmation ?? false,
        )
      }

      config.dangerously_allow_in_dirty_directory = await this.askYesNo(
        'Allow running in directories with uncommitted changes?',
        config.dangerously_allow_in_dirty_directory ?? false,
      )

      config.dangerously_allow_without_version_control = await this.askYesNo(
        'Allow running in directories without version control?',
        config.dangerously_allow_without_version_control ?? false,
      )

      // UI settings
      console.log('\n--- UI Settings ---')
      config.show_notifications = await this.askYesNo(
        'Show desktop notifications?',
        config.show_notifications ?? true,
      )

      if (config.show_notifications) {
        config.sticky_notifications = await this.askYesNo(
          'Make notifications sticky (require manual dismissal)?',
          config.sticky_notifications ?? false,
        )
      }

      config.quiet = await this.askYesNo(
        'Run in quiet mode (suppress preflight messages)?',
        config.quiet ?? false,
      )

      // Advanced settings
      const advancedSettings = await this.askYesNo('\nConfigure advanced settings?', false)

      if (advancedSettings) {
        console.log('\n--- Advanced Settings ---')

        config.allow_buffer_snapshots = await this.askYesNo(
          'Allow terminal buffer snapshots (Ctrl+Shift+S)?',
          config.allow_buffer_snapshots ?? false,
        )

        config.log_all_pattern_matches = await this.askYesNo(
          'Log all pattern matches for debugging?',
          config.log_all_pattern_matches ?? false,
        )

        config.debug = await this.askYesNo('Enable debug mode?', config.debug ?? false)

        // Path acceptance configuration
        const configurePaths = await this.askYesNo(
          'Configure path-specific auto-acceptance?',
          false,
        )

        if (configurePaths) {
          config.accept_bash_commands_in_cwd = await this.askPathAcceptance()
        }
      }

      // Save as preset?
      const saveAsPreset = await this.askYesNo('\n💾 Save this configuration as a preset?', false)

      if (saveAsPreset) {
        const presetName = await this.ask('Preset name:', 'My Configuration')
        const presetDescription = await this.ask(
          'Description:',
          'Custom configuration created by wizard',
        )

        await this.presetManager.createFromCurrent(presetName, presetDescription, {
          category: 'custom',
          tags: ['wizard'],
          author: process.env.USER || 'wizard',
        })

        console.log(`\n✓ Preset '${presetName}' saved successfully!`)
      }

      return config as AppConfig
    } finally {
      this.rl.close()
    }
  }

  /**
   * Apply default values to configuration
   */
  private applyDefaults(config: Partial<AppConfig>): AppConfig {
    return {
      provider: config.provider || 'claude-code',
      yolo: config.yolo ?? false,
      show_notifications: config.show_notifications ?? true,
      sticky_notifications: config.sticky_notifications ?? false,
      quiet: config.quiet ?? false,
      allow_buffer_snapshots: config.allow_buffer_snapshots ?? false,
      log_all_pattern_matches: config.log_all_pattern_matches ?? false,
      debug: config.debug ?? false,
      dangerously_allow_in_dirty_directory: config.dangerously_allow_in_dirty_directory ?? false,
      dangerously_allow_without_version_control:
        config.dangerously_allow_without_version_control ?? false,
      dangerously_suppress_yolo_confirmation:
        config.dangerously_suppress_yolo_confirmation ?? false,
      ...config,
    } as AppConfig
  }

  /**
   * Ask for provider selection
   */
  private async askProvider(current?: string): Promise<string> {
    const defaultProvider = current || 'claude-code'

    // Detect installed providers
    const detected = detectAvailableProviders()
    const installedIds = new Set(detected.map((d) => d.provider.id))

    // Build provider list with categories
    const providers: Array<{ id: string; name: string; installed: boolean; priority: string }> = []

    // Group by priority
    const highPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'high')
    const mediumPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'medium')
    const lowPriority = Object.values(AI_PROVIDERS).filter((p) => p.priority === 'low')

    console.log('\nSelect AI provider:')
    let index = 1

    // Show high priority providers
    highPriority.forEach((p) => {
      const installed = installedIds.has(p.id)
      const marker = p.id === defaultProvider ? '>' : ' '
      const status = installed ? '✓' : '(not installed)'
      console.log(`${marker} ${index}. ${p.name} ${status}`)
      providers.push({ id: p.id, name: p.name, installed, priority: p.priority })
      index++
    })

    // Show medium priority if any
    if (mediumPriority.length > 0) {
      console.log('  ─────')
      mediumPriority.forEach((p) => {
        const installed = installedIds.has(p.id)
        const marker = p.id === defaultProvider ? '>' : ' '
        const status = installed ? '✓' : '(not installed)'
        console.log(`${marker} ${index}. ${p.name} ${status}`)
        providers.push({ id: p.id, name: p.name, installed, priority: p.priority })
        index++
      })
    }

    // Show low priority if any
    if (lowPriority.length > 0) {
      console.log('  ─────')
      lowPriority.forEach((p) => {
        const installed = installedIds.has(p.id)
        const marker = p.id === defaultProvider ? '>' : ' '
        const status = installed ? '✓' : '(not installed)'
        console.log(`${marker} ${index}. ${p.name} ${status}`)
        providers.push({ id: p.id, name: p.name, installed, priority: p.priority })
        index++
      })
    }

    const defaultIndex = providers.findIndex((p) => p.id === defaultProvider) + 1 || 1
    const answer = await this.ask(
      `Provider (1-${providers.length}) [${defaultIndex}]`,
      defaultIndex,
    )

    const selectedIndex = parseInt(answer.toString()) - 1
    const selected = providers[selectedIndex]

    if (selected && !selected.installed) {
      const provider = AI_PROVIDERS[selected.id]
      console.log(`\n⚠️  ${provider.name} is not installed`)
      console.log(`   ${provider.installInstructions}`)
      const proceed = await this.askYesNo('Continue anyway?', true)
      if (!proceed) {
        return this.askProvider(current) // Ask again
      }
    }

    return selected?.id || defaultProvider
  }

  /**
   * Ask for path acceptance configuration
   */
  private async askPathAcceptance(): Promise<string[] | boolean> {
    console.log('\nPath acceptance configuration:')
    console.log('1. Accept all bash commands (true)')
    console.log('2. Reject all bash commands (false)')
    console.log('3. Configure specific paths')

    const choice = await this.ask('Choice (1-3):', '2')

    switch (choice) {
      case '1':
        return true
      case '2':
        return false
      case '3':
        const paths: string[] = []
        let addMore = true

        while (addMore) {
          const pathInput = await this.ask('Path pattern (e.g., src/*, *.test.js):', '')
          if (pathInput) {
            paths.push(pathInput)
          }
          addMore = await this.askYesNo('Add another path?', false)
        }

        return paths
      default:
        return false
    }
  }

  /**
   * Ask a yes/no question
   */
  private async askYesNo(question: string, defaultValue: boolean): Promise<boolean> {
    const defaultStr = defaultValue ? 'Y/n' : 'y/N'
    const answer = await this.ask(`${question} [${defaultStr}]:`, defaultValue ? 'y' : 'n')

    const normalized = answer.toString().toLowerCase().trim()
    if (normalized === '') {
      return defaultValue
    }

    return normalized === 'y' || normalized === 'yes'
  }

  /**
   * Ask a general question
   */
  private ask(question: string, defaultValue: any): Promise<string> {
    return new Promise((resolve) => {
      const prompt = defaultValue !== undefined ? `${question} [${defaultValue}] ` : `${question} `

      this.rl!.question(prompt, (answer) => {
        resolve(answer.trim() || defaultValue.toString())
      })
    })
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: AppConfig, filePath?: string): Promise<string> {
    const targetPath = filePath || path.join(CONFIG_PATHS.getConfigDirectory(), 'config.yaml')

    // Ensure directory exists
    const dir = path.dirname(targetPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Save configuration
    const yamlContent = yaml.stringify(config)
    fs.writeFileSync(targetPath, yamlContent)

    return targetPath
  }

  /**
   * Get preset recommendations based on user preferences
   */
  getRecommendedPresets(preferences: {
    experience?: 'beginner' | 'intermediate' | 'expert'
    workflow?: 'careful' | 'balanced' | 'fast'
    environment?: 'personal' | 'team' | 'ci'
  }): string[] {
    const recommendations: string[] = []

    // Based on experience level
    if (preferences.experience === 'beginner') {
      recommendations.push('cautious')
    } else if (preferences.experience === 'expert') {
      recommendations.push('productive')
    }

    // Based on workflow preference
    if (preferences.workflow === 'careful') {
      recommendations.push('cautious')
    } else if (preferences.workflow === 'fast') {
      recommendations.push('productive')
    } else {
      recommendations.push('minimal')
    }

    // Based on environment
    if (preferences.environment === 'team') {
      recommendations.push('team-collab')
    } else if (preferences.environment === 'ci') {
      recommendations.push('ci-friendly')
    }

    // Remove duplicates
    return [...new Set(recommendations)]
  }
}
