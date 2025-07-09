import * as fs from 'fs'
import * as path from 'path'
import { PresetManager } from '../features/preset-manager.js'

function printHelp(): void {
  console.log(`
Configuration Preset Management

Usage: coda preset <command> [options]

Commands:
  list [category]              List all available presets
  show <id>                    Show details of a specific preset
  apply <id>                   Apply a preset to current configuration
  create <name>                Create a new preset from current config
  update <id>                  Update an existing custom preset
  delete <id>                  Delete a custom preset
  duplicate <id> <new-name>    Create a copy of an existing preset
  import <file>                Import a preset from file
  export <id> <file>           Export a preset to file
  search <query>               Search presets by name, description, or tags
  favorite <id>                Toggle favorite status for a preset
  favorites                    List favorite presets
  recommend                    Get preset recommendations for current project
  
Options:
  --category <type>            Filter by category (general, project, workflow, security, custom)
  --description <text>         Set description when creating preset
  --tags <tag1,tag2>           Add tags when creating preset
  --author <name>              Set author when creating preset
  --merge                      Merge with existing config when applying preset

Examples:
  coda preset list
  coda preset show productive
  coda preset apply cautious
  coda preset create "My Project Config" --description "Optimized for my workflow" --tags "personal,fast"
  coda preset search debug
  coda preset favorite productive
  coda preset export minimal ./minimal-preset.yaml
`)
}

function formatPreset(preset: any, detailed: boolean = false): void {
  if (detailed) {
    console.log(`\nPreset: ${preset.name} (${preset.id})`)
    console.log(`Category: ${preset.category}`)
    console.log(`Description: ${preset.description}`)
    if (preset.tags.length > 0) {
      console.log(`Tags: ${preset.tags.join(', ')}`)
    }
    if (preset.author) {
      console.log(`Author: ${preset.author}`)
    }
    console.log(`Created: ${new Date(preset.created).toLocaleDateString()}`)
    console.log(`Updated: ${new Date(preset.updated).toLocaleDateString()}`)
    if (preset.isBuiltIn) {
      console.log(`Type: Built-in`)
    }
    console.log('\nConfiguration:')
    Object.entries(preset.config).forEach(([key, value]) => {
      console.log(`  ${key}: ${JSON.stringify(value)}`)
    })
  } else {
    const icon = preset.isBuiltIn ? '📦' : '✏️'
    const tags = preset.tags.length > 0 ? ` [${preset.tags.join(', ')}]` : ''
    console.log(
      `${icon} ${preset.id.padEnd(20)} ${preset.name.padEnd(25)} ${preset.description}${tags}`,
    )
  }
}

export async function handlePresetCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const manager = new PresetManager()

  try {
    switch (command) {
      case 'list': {
        const category = args[1]
        const presets = manager.getPresets(category)

        if (presets.length === 0) {
          console.log('No presets found.')
          return
        }

        console.log('\nAvailable Presets:')
        console.log('─'.repeat(80))

        // Group by category
        const grouped = presets.reduce(
          (acc, preset) => {
            if (!acc[preset.category]) {
              acc[preset.category] = []
            }
            acc[preset.category].push(preset)
            return acc
          },
          {} as Record<string, any[]>,
        )

        Object.entries(grouped).forEach(([cat, catPresets]) => {
          console.log(`\n${cat.charAt(0).toUpperCase() + cat.slice(1)}:`)
          catPresets.forEach((preset) => formatPreset(preset, false))
        })

        const stats = manager.getStats()
        console.log(`\nTotal: ${stats.totalPresets} presets`)
        if (stats.lastUsed) {
          console.log(`Last used: ${stats.lastUsed}`)
        }
        break
      }

      case 'show': {
        const id = args[1]
        if (!id) {
          console.error('Error: Preset ID required')
          console.log('Usage: coda preset show <id>')
          process.exit(1)
        }

        const preset = manager.getPreset(id)
        if (!preset) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        formatPreset(preset, true)

        // Show if it's a favorite
        const stats = manager.getStats()
        if (stats.favorites.includes(id)) {
          console.log('\n⭐ This preset is in your favorites')
        }
        break
      }

      case 'apply': {
        const id = args[1]
        if (!id) {
          console.error('Error: Preset ID required')
          console.log('Usage: coda preset apply <id>')
          process.exit(1)
        }

        const preset = manager.getPreset(id)
        if (!preset) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        console.log(`Applying preset: ${preset.name}`)

        await manager.applyPreset(id)

        console.log('✓ Preset applied successfully')
        console.log('\nApplied configuration:')
        Object.entries(preset.config).forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value)}`)
        })

        console.log('\nRestart your session for changes to take effect.')
        break
      }

      case 'create': {
        const name = args[1]
        if (!name) {
          console.error('Error: Preset name required')
          console.log('Usage: coda preset create <name> [options]')
          process.exit(1)
        }

        // Parse options
        let description = `Custom preset created on ${new Date().toLocaleDateString()}`
        let tags: string[] = []
        let author: string | undefined
        let category: any = 'custom'

        for (let i = 2; i < args.length; i += 2) {
          const option = args[i]
          const value = args[i + 1]

          switch (option) {
            case '--description':
              description = value || description
              break
            case '--tags':
              tags = value ? value.split(',').map((t) => t.trim()) : []
              break
            case '--author':
              author = value
              break
            case '--category':
              if (['general', 'project', 'workflow', 'security', 'custom'].includes(value)) {
                category = value
              }
              break
          }
        }

        console.log('Creating preset from current configuration...')

        const preset = await manager.createFromCurrent(name, description, {
          category,
          tags,
          author,
        })

        console.log(`✓ Preset '${preset.id}' created successfully`)
        formatPreset(preset, true)
        break
      }

      case 'update': {
        const id = args[1]
        if (!id) {
          console.error('Error: Preset ID required')
          console.log('Usage: coda preset update <id>')
          process.exit(1)
        }

        const existing = manager.getPreset(id)
        if (!existing) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        if (existing.isBuiltIn) {
          console.error('Error: Cannot modify built-in presets')
          console.log('Tip: Use "coda preset duplicate" to create a customizable copy')
          process.exit(1)
        }

        // For now, just update from current config
        // In a real implementation, this could open an editor
        console.log('Updating preset from current configuration...')

        const { loadConfigFile } = await import('../config/loader.js')
        const currentConfig = await loadConfigFile()

        const updated = manager.updatePreset(id, {
          config: currentConfig,
        })

        console.log(`✓ Preset '${id}' updated successfully`)
        formatPreset(updated, true)
        break
      }

      case 'delete': {
        const id = args[1]
        if (!id) {
          console.error('Error: Preset ID required')
          console.log('Usage: coda preset delete <id>')
          process.exit(1)
        }

        const preset = manager.getPreset(id)
        if (!preset) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        if (preset.isBuiltIn) {
          console.error('Error: Cannot delete built-in presets')
          process.exit(1)
        }

        // Simple confirmation
        console.log(`This will delete preset: ${preset.name}`)
        console.log('Are you sure? Type "yes" to confirm:')

        // In a real implementation, we'd use readline for user input
        console.log('\n(In production, this would wait for confirmation)')

        const success = manager.deletePreset(id)

        if (success) {
          console.log(`✓ Preset '${id}' deleted successfully`)
        }
        break
      }

      case 'duplicate': {
        const id = args[1]
        const newName = args[2]

        if (!id || !newName) {
          console.error('Error: Preset ID and new name required')
          console.log('Usage: coda preset duplicate <id> <new-name>')
          process.exit(1)
        }

        const original = manager.getPreset(id)
        if (!original) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        console.log(`Duplicating preset: ${original.name}`)

        const duplicate = manager.duplicatePreset(id, newName)

        console.log(`✓ Created duplicate preset '${duplicate.id}'`)
        formatPreset(duplicate, true)
        break
      }

      case 'import': {
        const file = args[1]
        if (!file) {
          console.error('Error: Import file required')
          console.log('Usage: coda preset import <file>')
          process.exit(1)
        }

        console.log(`Importing preset from: ${file}`)

        try {
          const imported = manager.importPreset(file)

          console.log(`✓ Preset '${imported.id}' imported successfully`)
          formatPreset(imported, true)
        } catch (error) {
          console.error(`Error importing preset: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'export': {
        const id = args[1]
        const file = args[2]

        if (!id || !file) {
          console.error('Error: Preset ID and output file required')
          console.log('Usage: coda preset export <id> <file>')
          process.exit(1)
        }

        const preset = manager.getPreset(id)
        if (!preset) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        console.log(`Exporting preset: ${preset.name}`)

        try {
          manager.exportPreset(id, file)
          console.log(`✓ Preset exported to: ${file}`)
        } catch (error) {
          console.error(`Error exporting preset: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'search': {
        const query = args.slice(1).join(' ')
        if (!query) {
          console.error('Error: Search query required')
          console.log('Usage: coda preset search <query>')
          process.exit(1)
        }

        const results = manager.searchPresets(query)

        if (results.length === 0) {
          console.log(`No presets found matching: ${query}`)
          return
        }

        console.log(`\nFound ${results.length} preset(s) matching "${query}":\n`)
        results.forEach((preset) => formatPreset(preset, false))
        break
      }

      case 'favorite': {
        const id = args[1]
        if (!id) {
          console.error('Error: Preset ID required')
          console.log('Usage: coda preset favorite <id>')
          process.exit(1)
        }

        const preset = manager.getPreset(id)
        if (!preset) {
          console.error(`Error: Preset '${id}' not found`)
          process.exit(1)
        }

        const added = manager.toggleFavorite(id)

        if (added) {
          console.log(`⭐ Added '${preset.name}' to favorites`)
        } else {
          console.log(`✓ Removed '${preset.name}' from favorites`)
        }
        break
      }

      case 'favorites': {
        const favorites = manager.getFavorites()

        if (favorites.length === 0) {
          console.log('No favorite presets.')
          console.log('Use "coda preset favorite <id>" to add favorites.')
          return
        }

        console.log('\n⭐ Favorite Presets:\n')
        favorites.forEach((preset) => formatPreset(preset, false))
        break
      }

      case 'recommend': {
        const projectPath = process.cwd()
        const recommendations = manager.getRecommendedPresets(projectPath)

        if (recommendations.length === 0) {
          console.log('No specific recommendations for this project.')
          return
        }

        console.log('\n💡 Recommended Presets for this Project:\n')

        recommendations.forEach((preset, index) => {
          console.log(`${index + 1}. ${preset.name}`)
          console.log(`   ${preset.description}`)
          console.log(`   Use: coda preset apply ${preset.id}`)
          console.log()
        })

        // Show why they're recommended
        if (process.env.CI) {
          console.log('ℹ️  CI environment detected')
        }
        if (fs.existsSync(path.join(projectPath, '.git'))) {
          console.log('ℹ️  Git repository detected')
        }
        if (fs.existsSync(path.join(projectPath, 'package.json'))) {
          console.log('ℹ️  Node.js project detected')
        }
        break
      }

      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}
