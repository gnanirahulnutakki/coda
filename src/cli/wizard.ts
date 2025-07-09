import { ConfigWizard } from '../features/config-wizard.js'
import { log, warn } from '../utils/logging.js'
import { createInterface } from 'readline'

function printHelp(): void {
  console.log(`
Configuration Wizard

Usage: coda wizard [options]

Options:
  --preset <id>      Start with a specific preset configuration
  --defaults         Use all default values (non-interactive)
  --save <file>      Save configuration to specific file (default: ~/.coda/config.yaml)
  --recommend        Get preset recommendations based on your preferences

Examples:
  coda wizard                          # Run interactive configuration wizard
  coda wizard --preset minimal         # Start with minimal preset
  coda wizard --defaults               # Create config with all defaults
  coda wizard --recommend              # Get personalized preset recommendations
`)
}

async function getRecommendations(wizard: ConfigWizard): Promise<void> {
  console.log('\n🎯 Let me help you find the right configuration preset!\n')

  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const ask = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim().toLowerCase())
      })
    })
  }

  try {
    // Ask about experience
    console.log('What is your experience level with AI coding assistants?')
    console.log('1. Beginner - Just getting started')
    console.log('2. Intermediate - Comfortable with basics')
    console.log('3. Expert - Very experienced')
    const expAnswer = await ask('Your choice (1-3): ')

    const experience =
      expAnswer === '1' ? 'beginner' : expAnswer === '3' ? 'expert' : 'intermediate'

    // Ask about workflow preference
    console.log('\nHow would you describe your preferred workflow?')
    console.log('1. Careful - Review everything before applying')
    console.log('2. Balanced - Some automation with oversight')
    console.log('3. Fast - Maximum automation and speed')
    const workflowAnswer = await ask('Your choice (1-3): ')

    const workflow =
      workflowAnswer === '1' ? 'careful' : workflowAnswer === '3' ? 'fast' : 'balanced'

    // Ask about environment
    console.log('\nWhere will you primarily use this?')
    console.log('1. Personal projects')
    console.log('2. Team collaboration')
    console.log('3. CI/CD pipelines')
    const envAnswer = await ask('Your choice (1-3): ')

    const environment = envAnswer === '2' ? 'team' : envAnswer === '3' ? 'ci' : 'personal'

    // Get recommendations
    const recommendations = wizard.getRecommendedPresets({
      experience,
      workflow,
      environment,
    })

    console.log('\n✨ Based on your preferences, I recommend these presets:\n')

    const presetManager = await import('../features/preset-manager.js')
    const manager = new presetManager.PresetManager()

    recommendations.forEach((presetId, index) => {
      const preset = manager.getPreset(presetId)
      if (preset) {
        console.log(`${index + 1}. ${preset.name} (${preset.id})`)
        console.log(`   ${preset.description}`)
        console.log(`   Use: coda wizard --preset ${preset.id}`)
        console.log()
      }
    })

    console.log('💡 Tip: You can also browse all presets with: coda preset list')
  } finally {
    rl.close()
  }
}

export async function handleWizardCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  const wizard = new ConfigWizard()

  // Check for recommendation mode
  if (args.includes('--recommend')) {
    await getRecommendations(wizard)
    return
  }

  // Parse options
  const presetIndex = args.indexOf('--preset')
  const preset = presetIndex !== -1 && args[presetIndex + 1] ? args[presetIndex + 1] : undefined

  const saveIndex = args.indexOf('--save')
  const savePath = saveIndex !== -1 && args[saveIndex + 1] ? args[saveIndex + 1] : undefined

  const useDefaults = args.includes('--defaults')
  const interactive = !useDefaults

  try {
    // Run wizard
    const config = await wizard.runWizard({
      interactive,
      useDefaults,
      preset,
    })

    // Save configuration
    const savedPath = await wizard.saveConfig(config, savePath)

    console.log(`\n✅ Configuration saved to: ${savedPath}`)

    if (preset) {
      console.log(`\n📦 Based on preset: ${preset}`)
    }

    // Ask if user wants to start an AI session
    if (interactive) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const startSession = await new Promise<boolean>((resolve) => {
        rl.question('\n🚀 Would you like to start an AI session now? [Y/n]: ', (answer) => {
          rl.close()
          resolve(answer.toLowerCase() !== 'n')
        })
      })

      if (startSession) {
        console.log('\n✨ Starting AI session...\n')

        // Import and run the main function to start AI session
        const { spawn } = await import('child_process')
        const { AI_PROVIDER_PATHS } = await import('../config/paths.js')

        const provider = config.provider || 'claude-code'
        const providerCommand = AI_PROVIDER_PATHS.findProviderCommand(
          provider,
          config.provider_path,
        )

        if (!providerCommand) {
          warn(`Could not find ${provider} command. Please ensure it's installed.`)
          return
        }

        // Start the AI provider with inherited stdio so it's interactive
        const child = spawn(providerCommand, [], {
          stdio: 'inherit',
          shell: true,
        })

        // Exit when the AI session ends
        child.on('exit', (code) => {
          process.exit(code || 0)
        })

        return
      }
    }

    console.log('\n🚀 You can now use Coda with your new configuration!')
    console.log('   Run: coda "your prompt here"')
  } catch (error) {
    warn(`Configuration wizard failed: ${error.message}`)
    process.exit(1)
  }
}
