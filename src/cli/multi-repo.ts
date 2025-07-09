import * as path from 'path'
import * as fs from 'fs'
import { MultiRepoManager } from '../features/multi-repo.js'

function printHelp(): void {
  console.log(`
Multi-Repository Context Management

Usage: coda repo <command> [options]

Commands:
  add <path>                    Add a repository to track
  remove <repo>                 Remove a repository (by ID, name, or path)
  list                          List all tracked repositories
  sync <repo>                   Sync repository information
  relate <source> <target>      Add a relationship between repositories
  search <query>                Search across all repositories
  context <repo>                Get cross-repository context
  export <file>                 Export multi-repo configuration
  import <file>                 Import multi-repo configuration
  
Examples:
  coda repo add ../shared-lib
  coda repo add /Users/me/projects/api-service
  coda repo relate api-service shared-lib dependency
  coda repo search "getUserAuth" --pattern "*.ts"
  coda repo context .
  coda repo export multi-repo-config.json

Relationship Types:
  dependency      - One repo depends on another
  shared-code     - Repos share common code/types
  microservice    - Part of a microservices architecture
  monorepo        - Part of a monorepo structure
  fork            - One repo is a fork of another
  related         - General relationship
`)
}

export async function handleMultiRepoCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const manager = new MultiRepoManager()

  try {
    switch (command) {
      case 'add': {
        const repoPath = args[1]
        if (!repoPath) {
          console.error('Error: Repository path required')
          console.log('Usage: coda repo add <path>')
          process.exit(1)
        }

        console.log(`Adding repository: ${repoPath}...`)

        try {
          const repo = await manager.addRepository(repoPath)
          console.log(`✓ Added repository: ${repo.name}`)
          console.log(`  ID: ${repo.id}`)
          console.log(`  Path: ${repo.path}`)
          if (repo.url) console.log(`  URL: ${repo.url}`)
          if (repo.branch) console.log(`  Branch: ${repo.branch}`)
          if (repo.metadata?.language) console.log(`  Language: ${repo.metadata.language}`)
          if (repo.metadata?.framework) console.log(`  Framework: ${repo.metadata.framework}`)

          // Check for auto-detected relationships
          const relationships = manager.getRelationships(repo.id)
          if (relationships.length > 0) {
            console.log(`  Auto-detected relationships:`)
            relationships.forEach((rel) => {
              const otherRepo = rel.sourceRepo === repo.id ? rel.targetRepo : rel.sourceRepo
              console.log(`    - ${rel.type} with ${otherRepo}`)
            })
          }
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'remove': {
        const repoIdentifier = args[1]
        if (!repoIdentifier) {
          console.error('Error: Repository identifier required')
          console.log('Usage: coda repo remove <repo-id|name|path>')
          process.exit(1)
        }

        const success = manager.removeRepository(repoIdentifier)
        if (success) {
          console.log(`✓ Removed repository: ${repoIdentifier}`)
        } else {
          console.error(`Error: Repository not found: ${repoIdentifier}`)
          process.exit(1)
        }
        break
      }

      case 'list': {
        const repos = manager.getRepositories()

        if (repos.length === 0) {
          console.log('No repositories tracked.')
          console.log('Use "coda repo add <path>" to add a repository.')
          return
        }

        console.log(`Tracked Repositories (${repos.length}):\n`)

        repos.forEach((repo) => {
          console.log(`${repo.name}`)
          console.log(`  ID: ${repo.id}`)
          console.log(`  Path: ${repo.path}`)
          if (repo.url) console.log(`  URL: ${repo.url}`)
          if (repo.branch) console.log(`  Branch: ${repo.branch}`)
          if (repo.lastSync) {
            const syncDate = new Date(repo.lastSync)
            console.log(`  Last sync: ${syncDate.toLocaleString()}`)
          }
          if (repo.metadata?.description) {
            console.log(`  Description: ${repo.metadata.description}`)
          }
          if (repo.metadata?.language) {
            console.log(`  Language: ${repo.metadata.language}`)
          }
          if (repo.metadata?.framework) {
            console.log(`  Framework: ${repo.metadata.framework}`)
          }

          // Show relationships
          const relationships = manager.getRelationships(repo.id)
          if (relationships.length > 0) {
            console.log(`  Relationships:`)
            relationships.forEach((rel) => {
              const isSource = rel.sourceRepo === repo.id
              const otherRepoId = isSource ? rel.targetRepo : rel.sourceRepo
              const direction = isSource ? '→' : '←'
              console.log(`    ${direction} ${rel.type} ${otherRepoId}`)
              if (rel.description) {
                console.log(`      ${rel.description}`)
              }
            })
          }

          console.log()
        })
        break
      }

      case 'sync': {
        const repoIdentifier = args[1]
        if (!repoIdentifier) {
          console.error('Error: Repository identifier required')
          console.log('Usage: coda repo sync <repo-id|name|path>')
          process.exit(1)
        }

        console.log(`Syncing repository: ${repoIdentifier}...`)

        try {
          await manager.syncRepository(repoIdentifier)
          console.log(`✓ Repository synced successfully`)
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'relate': {
        const sourceRepo = args[1]
        const targetRepo = args[2]
        const relationType = args[3] as any
        const description = args.slice(4).join(' ')

        if (!sourceRepo || !targetRepo) {
          console.error('Error: Source and target repositories required')
          console.log('Usage: coda repo relate <source> <target> [type] [description]')
          console.log('Types: dependency, shared-code, microservice, monorepo, fork, related')
          process.exit(1)
        }

        const validTypes = [
          'dependency',
          'shared-code',
          'microservice',
          'monorepo',
          'fork',
          'related',
        ]
        const type = validTypes.includes(relationType) ? relationType : 'related'

        try {
          manager.addRelationship(sourceRepo, targetRepo, type, description || undefined)
          console.log(`✓ Added ${type} relationship: ${sourceRepo} → ${targetRepo}`)
          if (description) {
            console.log(`  Description: ${description}`)
          }
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'search': {
        const query = args[1]
        if (!query) {
          console.error('Error: Search query required')
          console.log('Usage: coda repo search <query> [--pattern <glob>] [--max <number>]')
          process.exit(1)
        }

        // Parse options
        const options: any = {}
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--pattern' && args[i + 1]) {
            options.filePattern = args[++i]
          } else if (args[i] === '--max' && args[i + 1]) {
            options.maxResults = parseInt(args[++i])
          } else if (args[i] === '--include' && args[i + 1]) {
            options.includeRepos = args[++i].split(',')
          } else if (args[i] === '--exclude' && args[i + 1]) {
            options.excludeRepos = args[++i].split(',')
          }
        }

        console.log(`Searching for "${query}"...`)
        if (options.filePattern) console.log(`  File pattern: ${options.filePattern}`)

        const results = await manager.searchAcrossRepos(query, options)

        if (results.length === 0) {
          console.log('No matches found.')
          return
        }

        console.log(`\nFound ${results.length} matches:\n`)

        let currentRepo = ''
        results.forEach((result) => {
          if (result.repo !== currentRepo) {
            currentRepo = result.repo
            const repo = manager.getRepositories().find((r) => r.id === result.repo)
            console.log(`\n${repo?.name || result.repo}:`)
          }

          console.log(`  ${result.file}:${result.line}`)
          console.log(`    ${result.content}`)
        })
        break
      }

      case 'context': {
        const repoPath = args[1] || '.'

        console.log(`Getting cross-repository context for: ${repoPath}...`)

        try {
          const context = await manager.getCrossRepoContext(repoPath)

          console.log('\nRepository Context:')
          console.log(`Primary: ${context.repositories[0].name}`)

          if (context.repositories.length > 1) {
            console.log('\nRelated Repositories:')
            context.repositories.slice(1).forEach((repo) => {
              console.log(`  - ${repo.name} (${repo.path})`)
              if (repo.metadata?.description) {
                console.log(`    ${repo.metadata.description}`)
              }
            })
          }

          if (context.relationships.length > 0) {
            console.log('\nRelationships:')
            context.relationships.forEach((rel) => {
              const source =
                context.repositories.find((r) => r.id === rel.sourceRepo)?.name || rel.sourceRepo
              const target =
                context.repositories.find((r) => r.id === rel.targetRepo)?.name || rel.targetRepo
              console.log(`  - ${source} → ${target} (${rel.type})`)
              if (rel.description) {
                console.log(`    ${rel.description}`)
              }
            })
          }

          if (context.sharedConfigs && context.sharedConfigs.length > 0) {
            console.log('\nShared Configurations:')
            context.sharedConfigs.forEach((config) => {
              const repoNames = config.repos
                .map((id) => context.repositories.find((r) => r.id === id)?.name || id)
                .join(', ')
              console.log(`  - ${config.name}: ${repoNames}`)
            })
          }

          // Generate AI context summary
          console.log('\n--- AI Context Summary ---')
          console.log(manager.generateContextSummary())
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'export': {
        const outputPath = args[1]
        if (!outputPath) {
          console.error('Error: Output file path required')
          console.log('Usage: coda repo export <file>')
          process.exit(1)
        }

        try {
          manager.exportConfiguration(outputPath)
          console.log(`✓ Exported configuration to: ${outputPath}`)

          const stats = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
          console.log(`  Repositories: ${stats.repositories.length}`)
          console.log(`  Relationships: ${stats.relationships.length}`)
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'import': {
        const configPath = args[1]
        if (!configPath) {
          console.error('Error: Configuration file path required')
          console.log('Usage: coda repo import <file>')
          process.exit(1)
        }

        try {
          manager.importConfiguration(configPath)
          console.log(`✓ Imported configuration from: ${configPath}`)

          const repos = manager.getRepositories()
          console.log(`  Repositories: ${repos.length}`)

          const relationships = repos.flatMap((r) => manager.getRelationships(r.id))
          const uniqueRels = new Set(
            relationships.map((r) => `${r.sourceRepo}-${r.targetRepo}-${r.type}`),
          )
          console.log(`  Relationships: ${uniqueRels.size}`)
        } catch (error) {
          console.error(`Error: ${error.message}`)
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
