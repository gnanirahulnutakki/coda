import { ContextMemory } from '../features/context-memory.js'
import { log, warn } from '../utils/logging.js'

export async function handleMemoryCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command) {
    console.log('Memory management commands:')
    console.log('  coda memory show          - Show current project context')
    console.log('  coda memory search <query> - Search context entries')
    console.log('  coda memory clear         - Clear current project context')
    console.log('  coda memory export <file> - Export context to file')
    console.log('  coda memory import <file> - Import context from file')
    console.log('  coda memory cleanup       - Clean up old memory files')
    console.log('  coda memory summary       - Update project summary')
    return
  }

  const memory = new ContextMemory()
  await memory.loadProjectContext(process.cwd())

  switch (command) {
    case 'show':
      await showContext(memory)
      break
    case 'search':
      await searchContext(memory, args[1])
      break
    case 'clear':
      await clearContext(memory)
      break
    case 'export':
      await exportContext(memory, args[1])
      break
    case 'import':
      await importContext(memory, args[1])
      break
    case 'cleanup':
      await cleanupMemory(memory)
      break
    case 'summary':
      await updateSummary(memory, args.slice(1))
      break
    default:
      warn(`Unknown memory command: ${command}`)
      break
  }
}

async function showContext(memory: ContextMemory): Promise<void> {
  const summary = memory.getContextSummary()
  
  if (!summary) {
    console.log('No context memory found for this project.')
    return
  }

  console.log('\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m')
  console.log('\x1b[36m║                 Project Context Memory               ║\x1b[0m')
  console.log('\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m\n')
  
  console.log(summary)
  
  const recent = memory.getRecentContext(10)
  if (recent.length > 0) {
    console.log('\n\x1b[33m📝 Recent Activity:\x1b[0m')
    recent.forEach((entry, index) => {
      const time = new Date(entry.timestamp).toLocaleTimeString()
      console.log(`  ${index + 1}. [${time}] ${entry.type}: ${entry.content.substring(0, 80)}...`)
    })
  }
}

async function searchContext(memory: ContextMemory, query?: string): Promise<void> {
  if (!query) {
    warn('Please provide a search query')
    return
  }

  const results = memory.searchContext(query)
  
  if (results.length === 0) {
    console.log(`No results found for: "${query}"`)
    return
  }

  console.log(`\x1b[32m Found ${results.length} results for "${query}":\x1b[0m\n`)
  
  results.forEach((entry, index) => {
    const time = new Date(entry.timestamp).toLocaleDateString()
    console.log(`${index + 1}. [${time}] ${entry.type.toUpperCase()}`)
    console.log(`   ${entry.content.substring(0, 120)}...`)
    if (entry.metadata?.file) {
      console.log(`   📁 ${entry.metadata.file}`)
    }
    if (entry.metadata?.command) {
      console.log(`   💻 ${entry.metadata.command}`)
    }
    console.log()
  })
}

async function clearContext(memory: ContextMemory): Promise<void> {
  // We can't directly clear from the ContextMemory class, so we'll create a new empty context
  const projectPath = process.cwd()
  
  console.log('\x1b[33m⚠️  This will permanently delete all context memory for this project.\x1b[0m')
  console.log('This action cannot be undone.')
  
  // For now, just show a warning. In a real implementation, we'd add a clear method
  warn('Context clearing not yet implemented. Use "coda memory export" to backup first.')
}

async function exportContext(memory: ContextMemory, filePath?: string): Promise<void> {
  if (!filePath) {
    warn('Please provide a file path for export')
    return
  }

  try {
    await memory.exportMemory(filePath)
    log(`✅ Context exported to: ${filePath}`)
  } catch (error) {
    warn(`Failed to export context: ${error.message}`)
  }
}

async function importContext(memory: ContextMemory, filePath?: string): Promise<void> {
  if (!filePath) {
    warn('Please provide a file path for import')
    return
  }

  try {
    await memory.importMemory(filePath)
    log(`✅ Context imported from: ${filePath}`)
  } catch (error) {
    warn(`Failed to import context: ${error.message}`)
  }
}

async function cleanupMemory(memory: ContextMemory): Promise<void> {
  try {
    await memory.cleanupOldMemory()
    log('✅ Cleaned up old memory files')
  } catch (error) {
    warn(`Failed to cleanup memory: ${error.message}`)
  }
}

async function updateSummary(memory: ContextMemory, summaryArgs: string[]): Promise<void> {
  if (summaryArgs.length === 0) {
    console.log('Update project metadata:')
    console.log('  coda memory summary --summary "Project description"')
    console.log('  coda memory summary --architecture "Architecture description"')
    console.log('  coda memory summary --decision "Key decision"')
    return
  }

  const metadata: any = {}
  
  for (let i = 0; i < summaryArgs.length; i += 2) {
    const flag = summaryArgs[i]
    const value = summaryArgs[i + 1]
    
    if (!value) continue
    
    switch (flag) {
      case '--summary':
        metadata.summary = value
        break
      case '--architecture':
        metadata.architecture = value
        break
      case '--decision':
        if (!metadata.keyDecisions) metadata.keyDecisions = []
        metadata.keyDecisions.push(value)
        break
    }
  }
  
  if (Object.keys(metadata).length === 0) {
    warn('No valid metadata provided')
    return
  }
  
  await memory.updateProjectMetadata(metadata)
  log('✅ Project metadata updated')
}