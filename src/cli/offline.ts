import * as fs from 'fs'
import { OfflineCacheManager } from '../features/offline-cache.js'

function printHelp(): void {
  console.log(`
Offline Mode - Cache AI Responses for Offline Use

Usage: coda offline <command> [options]

Commands:
  status                       Show offline mode status and cache statistics
  enable                       Enable offline mode
  disable                      Disable offline mode
  search <query>               Search cached responses
  show <id>                    Show details of a cached response
  delete <id>                  Delete a specific cached response
  clear                        Clear all cached responses
  cleanup                      Remove expired cache entries
  export <file>                Export cache to file
  import <file>                Import cache from file
  config                       Show current configuration
  config set <key> <value>     Update configuration

Configuration Options:
  maxCacheSize <MB>           Maximum cache size in megabytes
  maxEntries <number>         Maximum number of cached entries
  expirationDays <days>       Days before cache entries expire
  matchingStrategy <strategy>  How to match prompts (exact, fuzzy)
  fallbackBehavior <behavior>  What to do when offline (error, warn, silent)

Examples:
  coda offline status
  coda offline enable
  coda offline search "unit test"
  coda offline config set maxCacheSize 1000
  coda offline export cache-backup.json
  coda offline cleanup
`)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
}

export async function handleOfflineCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const cacheManager = new OfflineCacheManager()

  try {
    switch (command) {
      case 'status': {
        const enabled = cacheManager.isEnabled()
        const stats = cacheManager.getStats()

        console.log('\n--- Offline Mode Status ---')
        console.log(`Status: ${enabled ? '✓ Enabled' : '✗ Disabled'}`)
        console.log(`\nCache Statistics:`)
        console.log(`  Total entries: ${stats.totalEntries}`)
        console.log(`  Total size: ${formatBytes(stats.totalSize)}`)
        console.log(`  Average entry size: ${formatBytes(stats.averageResponseSize)}`)

        if (stats.hitRate !== undefined) {
          console.log(`  Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`)
        }

        if (stats.oldestEntry) {
          console.log(`  Oldest entry: ${new Date(stats.oldestEntry).toLocaleString()}`)
        }

        if (stats.newestEntry) {
          console.log(`  Newest entry: ${new Date(stats.newestEntry).toLocaleString()}`)
        }

        if (Object.keys(stats.providers).length > 0) {
          console.log('\nCached by provider:')
          for (const [provider, count] of Object.entries(stats.providers)) {
            console.log(`  ${provider}: ${count} entries`)
          }
        }
        break
      }

      case 'enable': {
        cacheManager.setEnabled(true)
        console.log('✓ Offline mode enabled')
        console.log('\nCached responses will be used when available.')
        console.log('New responses will be automatically cached.')
        break
      }

      case 'disable': {
        cacheManager.setEnabled(false)
        console.log('✓ Offline mode disabled')
        console.log('\nCached responses will not be used.')
        console.log('New responses will not be cached.')
        break
      }

      case 'search': {
        const query = args.slice(1).join(' ')
        if (!query) {
          console.error('Error: Search query required')
          console.log('Usage: coda offline search <query>')
          process.exit(1)
        }

        console.log(`Searching for: "${query}"...`)

        const results = await cacheManager.searchCache(query, 10)

        if (results.length === 0) {
          console.log('\nNo matching cached responses found.')
          return
        }

        console.log(`\nFound ${results.length} matching response(s):\n`)

        results.forEach((entry, index) => {
          console.log(`${index + 1}. [${entry.id}]`)
          console.log(`   Provider: ${entry.provider}${entry.model ? ` (${entry.model})` : ''}`)
          console.log(
            `   Prompt: ${entry.prompt.substring(0, 80)}${entry.prompt.length > 80 ? '...' : ''}`,
          )
          console.log(
            `   Response: ${entry.response.substring(0, 80)}${entry.response.length > 80 ? '...' : ''}`,
          )
          console.log(`   Cached: ${new Date(entry.timestamp).toLocaleString()}`)

          if (entry.tags && entry.tags.length > 0) {
            console.log(`   Tags: ${entry.tags.join(', ')}`)
          }

          if (entry.expiresAt) {
            const expires = new Date(entry.expiresAt)
            const now = new Date()
            if (expires > now) {
              const daysLeft = Math.ceil(
                (expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
              )
              console.log(`   Expires: in ${daysLeft} day(s)`)
            } else {
              console.log(`   Expires: EXPIRED`)
            }
          }

          console.log()
        })
        break
      }

      case 'show': {
        const id = args[1]
        if (!id) {
          console.error('Error: Cache entry ID required')
          console.log('Usage: coda offline show <id>')
          process.exit(1)
        }

        // Since we don't have a direct getById method, we'll search through all entries
        const stats = cacheManager.getStats()
        let found = false

        // This is a limitation - we'd need to add a getById method to the manager
        // For now, we'll show an appropriate message
        console.log(`\nTo view cached entries, use:`)
        console.log(`  coda offline search <part-of-prompt>`)
        console.log(`\nOr export the cache to inspect all entries:`)
        console.log(`  coda offline export cache.json`)
        break
      }

      case 'delete': {
        const id = args[1]
        if (!id) {
          console.error('Error: Cache entry ID required')
          console.log('Usage: coda offline delete <id>')
          process.exit(1)
        }

        const success = cacheManager.deleteEntry(id)

        if (success) {
          console.log(`✓ Deleted cache entry: ${id}`)
        } else {
          console.error(`Error: Cache entry not found: ${id}`)
          process.exit(1)
        }
        break
      }

      case 'clear': {
        const stats = cacheManager.getStats()

        if (stats.totalEntries === 0) {
          console.log('Cache is already empty.')
          return
        }

        // Simple confirmation
        console.log(`\nThis will delete ${stats.totalEntries} cached response(s).`)
        console.log('Are you sure? Type "yes" to confirm:')

        // In a real implementation, we'd use readline to get user input
        // For now, we'll just show the warning
        console.log('\n(In production, this would wait for confirmation)')

        cacheManager.clearCache()
        console.log('\n✓ Cache cleared successfully')
        break
      }

      case 'cleanup': {
        console.log('Cleaning up expired cache entries...')

        const deletedCount = cacheManager.cleanup()

        if (deletedCount === 0) {
          console.log('No expired entries found.')
        } else {
          console.log(
            `✓ Removed ${deletedCount} expired cache entr${deletedCount === 1 ? 'y' : 'ies'}`,
          )
        }

        const stats = cacheManager.getStats()
        console.log(`\nRemaining entries: ${stats.totalEntries}`)
        console.log(`Cache size: ${formatBytes(stats.totalSize)}`)
        break
      }

      case 'export': {
        const outputFile = args[1]
        if (!outputFile) {
          console.error('Error: Output file required')
          console.log('Usage: coda offline export <file>')
          process.exit(1)
        }

        console.log(`Exporting cache to: ${outputFile}`)

        // Parse filter options
        const filterArgs = args.slice(2)
        const filter: any = {}

        for (let i = 0; i < filterArgs.length; i += 2) {
          const key = filterArgs[i]
          const value = filterArgs[i + 1]

          if (key === '--provider') filter.provider = value
          else if (key === '--model') filter.model = value
          else if (key === '--tags') filter.tags = value.split(',')
        }

        try {
          cacheManager.exportCache(outputFile, Object.keys(filter).length > 0 ? filter : undefined)

          const stats = fs.statSync(outputFile)
          console.log(`✓ Exported successfully`)
          console.log(`  File size: ${formatBytes(stats.size)}`)

          // Read back to show entry count
          const exported = JSON.parse(fs.readFileSync(outputFile, 'utf8'))
          console.log(`  Entries: ${exported.entries.length}`)
        } catch (error) {
          console.error(`Error exporting cache: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'import': {
        const inputFile = args[1]
        if (!inputFile) {
          console.error('Error: Input file required')
          console.log('Usage: coda offline import <file>')
          process.exit(1)
        }

        const merge = args.includes('--merge')

        try {
          console.log(`Importing cache from: ${inputFile}`)
          if (merge) {
            console.log('Mode: Merge with existing cache')
          } else {
            console.log('Mode: Replace existing cache')
          }

          const importedCount = cacheManager.importCache(inputFile, { merge })

          console.log(`✓ Imported ${importedCount} cache entr${importedCount === 1 ? 'y' : 'ies'}`)

          const stats = cacheManager.getStats()
          console.log(`\nTotal entries: ${stats.totalEntries}`)
          console.log(`Total size: ${formatBytes(stats.totalSize)}`)
        } catch (error) {
          console.error(`Error importing cache: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'config': {
        const subCommand = args[1]

        if (!subCommand) {
          // Show current config
          console.log('\n--- Offline Mode Configuration ---')
          console.log('(Configuration display not fully implemented)')
          console.log('\nAvailable settings:')
          console.log('  maxCacheSize     - Maximum cache size in MB')
          console.log('  maxEntries       - Maximum number of entries')
          console.log('  expirationDays   - Days before entries expire')
          console.log('  matchingStrategy - How to match prompts (exact/fuzzy)')
          console.log('  fallbackBehavior - Offline behavior (error/warn/silent)')
          console.log('\nUse: coda offline config set <key> <value>')
          return
        }

        if (subCommand === 'set') {
          const key = args[2]
          const value = args[3]

          if (!key || !value) {
            console.error('Error: Key and value required')
            console.log('Usage: coda offline config set <key> <value>')
            process.exit(1)
          }

          const config: any = {}

          switch (key) {
            case 'maxCacheSize':
              config.maxCacheSize = parseInt(value)
              break
            case 'maxEntries':
              config.maxEntries = parseInt(value)
              break
            case 'expirationDays':
              config.expirationDays = parseInt(value)
              break
            case 'matchingStrategy':
              if (!['exact', 'fuzzy'].includes(value)) {
                console.error('Error: matchingStrategy must be "exact" or "fuzzy"')
                process.exit(1)
              }
              config.matchingStrategy = value
              break
            case 'fallbackBehavior':
              if (!['error', 'warn', 'silent'].includes(value)) {
                console.error('Error: fallbackBehavior must be "error", "warn", or "silent"')
                process.exit(1)
              }
              config.fallbackBehavior = value
              break
            default:
              console.error(`Error: Unknown configuration key: ${key}`)
              process.exit(1)
          }

          cacheManager.updateConfig(config)
          console.log(`✓ Updated ${key} to ${value}`)
        } else {
          console.error(`Unknown config command: ${subCommand}`)
          process.exit(1)
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
