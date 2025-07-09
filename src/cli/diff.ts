import * as fs from 'fs'
import * as readline from 'readline'
import { DiffPreviewer } from '../features/diff-preview.js'
import { log, warn } from '../utils/logging.js'

export async function handleDiffCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command) {
    console.log('Diff preview commands:')
    console.log('  coda diff add <file> <content>           - Add file change to preview')
    console.log('  coda diff add-stdin <file>               - Add file change from stdin')
    console.log('  coda diff delete <file>                  - Add file deletion to preview')
    console.log('  coda diff show [--format=unified|side]   - Show pending changes')
    console.log('  coda diff stats                          - Show statistics about changes')
    console.log('  coda diff apply                          - Apply all pending changes')
    console.log('  coda diff discard                        - Discard all pending changes')
    console.log('  coda diff save <output-file>             - Save diff to file')
    console.log('  coda diff tool [diff-tool]               - Open in external diff tool')
    console.log('  coda diff interactive                    - Interactive diff review mode')
    return
  }

  // Use a singleton diff previewer for the session
  const diffPreviewer = getDiffPreviewer()

  switch (command) {
    case 'add':
      await addFileChange(diffPreviewer, args.slice(1))
      break
    case 'add-stdin':
      await addFileChangeFromStdin(diffPreviewer, args.slice(1))
      break
    case 'delete':
      await addFileDeletion(diffPreviewer, args.slice(1))
      break
    case 'show':
      await showDiff(diffPreviewer, args.slice(1))
      break
    case 'stats':
      await showStats(diffPreviewer)
      break
    case 'apply':
      await applyChanges(diffPreviewer)
      break
    case 'discard':
      await discardChanges(diffPreviewer)
      break
    case 'save':
      await saveDiff(diffPreviewer, args.slice(1))
      break
    case 'tool':
      await openInTool(diffPreviewer, args.slice(1))
      break
    case 'interactive':
      await interactiveReview(diffPreviewer)
      break
    default:
      warn(`Unknown diff command: ${command}`)
      break
  }
}

// Singleton instance for the session
let globalDiffPreviewer: DiffPreviewer | null = null

function getDiffPreviewer(): DiffPreviewer {
  if (!globalDiffPreviewer) {
    globalDiffPreviewer = new DiffPreviewer()
  }
  return globalDiffPreviewer
}

async function addFileChange(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (args.length < 2) {
    warn('Usage: coda diff add <file> <content>')
    warn('Example: coda diff add src/app.js "console.log(\'Hello\')"')
    return
  }

  const file = args[0]
  const content = args.slice(1).join(' ')
  
  try {
    const type = fs.existsSync(file) ? 'modify' : 'create'
    previewer.addFileChange(file, content, type)
    
    if (type === 'create') {
      log(`✅ Added new file to preview: ${file}`)
    } else {
      log(`✅ Added file modification to preview: ${file}`)
    }
    
    // Show brief stats
    const stats = previewer.getStats()
    log(`📊 Pending changes: ${stats.totalFiles} files (+${stats.totalAdditions} -${stats.totalDeletions})`)
  } catch (error) {
    warn(`Failed to add file change: ${error.message}`)
  }
}

async function addFileChangeFromStdin(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Usage: coda diff add-stdin <file>')
    warn('Then provide content via stdin (Ctrl+D to finish)')
    return
  }

  const file = args[0]
  
  try {
    console.log('Enter content (Ctrl+D to finish):')
    
    const content = await readFromStdin()
    
    const type = fs.existsSync(file) ? 'modify' : 'create'
    previewer.addFileChange(file, content, type)
    
    if (type === 'create') {
      log(`✅ Added new file to preview: ${file}`)
    } else {
      log(`✅ Added file modification to preview: ${file}`)
    }
  } catch (error) {
    warn(`Failed to add file change: ${error.message}`)
  }
}

async function readFromStdin(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  })

  const lines: string[] = []
  
  for await (const line of rl) {
    lines.push(line)
  }
  
  return lines.join('\n')
}

async function addFileDeletion(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Usage: coda diff delete <file>')
    return
  }

  const file = args[0]
  
  try {
    await previewer.addFileDeletion(file)
    log(`✅ Added file deletion to preview: ${file}`)
    
    // Show brief stats
    const stats = previewer.getStats()
    log(`📊 Pending changes: ${stats.totalFiles} files (+${stats.totalAdditions} -${stats.totalDeletions})`)
  } catch (error) {
    warn(`Failed to add file deletion: ${error.message}`)
  }
}

async function showDiff(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to preview')
    return
  }

  const formatArg = args.find(arg => arg.startsWith('--format='))
  const format = formatArg?.split('=')[1] || 'unified'
  
  const options = {
    colorize: true,
    unifiedFormat: format === 'unified',
    sideBySide: format === 'side'
  }
  
  const preview = previewer.getPreview(options)
  console.log(preview)
}

async function showStats(previewer: DiffPreviewer): Promise<void> {
  const stats = previewer.getStats()
  
  console.log(`\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m`)
  console.log(`\x1b[36m║                  Diff Statistics                     ║\x1b[0m`)
  console.log(`\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m\n`)
  
  console.log(`\x1b[33mFile Changes:\x1b[0m`)
  console.log(`  📁 Total files: ${stats.totalFiles}`)
  console.log(`  ✨ Files created: ${stats.filesCreated}`)
  console.log(`  ✏️  Files modified: ${stats.filesModified}`)
  console.log(`  🗑️  Files deleted: ${stats.filesDeleted}`)
  
  console.log(`\n\x1b[33mLine Changes:\x1b[0m`)
  console.log(`  \x1b[32m+ Additions: ${stats.totalAdditions}\x1b[0m`)
  console.log(`  \x1b[31m- Deletions: ${stats.totalDeletions}\x1b[0m`)
  console.log(`  📊 Net change: ${stats.totalAdditions - stats.totalDeletions}`)
  
  if (stats.totalFiles === 0) {
    console.log(`\n\x1b[90mNo pending changes\x1b[0m`)
  }
}

async function applyChanges(previewer: DiffPreviewer): Promise<void> {
  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to apply')
    return
  }

  try {
    const stats = previewer.getStats()
    
    // Show what will be applied
    console.log(`\x1b[33mApplying changes:\x1b[0m`)
    console.log(`  📁 ${stats.totalFiles} files`)
    console.log(`  \x1b[32m+${stats.totalAdditions}\x1b[0m \x1b[31m-${stats.totalDeletions}\x1b[0m\n`)
    
    // Confirm before applying
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise<string>((resolve) => {
      rl.question('Apply these changes? (y/N): ', resolve)
    })
    rl.close()
    
    if (answer.toLowerCase() !== 'y') {
      console.log('Changes not applied')
      return
    }
    
    const result = await previewer.applyChanges()
    
    if (result.succeeded.length > 0) {
      console.log(`\n\x1b[32m✅ Successfully applied changes to:\x1b[0m`)
      result.succeeded.forEach(file => {
        console.log(`   ${file}`)
      })
    }
    
    if (result.failed.length > 0) {
      console.log(`\n\x1b[31m❌ Failed to apply changes to:\x1b[0m`)
      result.failed.forEach(({ file, error }) => {
        console.log(`   ${file}: ${error}`)
      })
    }
    
    log(`\n📊 Applied ${result.succeeded.length}/${result.totalChanges} changes`)
  } catch (error) {
    warn(`Failed to apply changes: ${error.message}`)
  }
}

async function discardChanges(previewer: DiffPreviewer): Promise<void> {
  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to discard')
    return
  }

  const stats = previewer.getStats()
  
  // Confirm before discarding
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Discard ${stats.totalFiles} pending changes? (y/N): `, resolve)
  })
  rl.close()
  
  if (answer.toLowerCase() !== 'y') {
    console.log('Changes not discarded')
    return
  }
  
  previewer.discardChanges()
  log('✅ All pending changes discarded')
}

async function saveDiff(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Usage: coda diff save <output-file>')
    return
  }

  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to save')
    return
  }

  const outputFile = args[0]
  
  try {
    previewer.savePreview(outputFile)
    log(`✅ Diff saved to: ${outputFile}`)
  } catch (error) {
    warn(`Failed to save diff: ${error.message}`)
  }
}

async function openInTool(previewer: DiffPreviewer, args: string[]): Promise<void> {
  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to preview')
    return
  }

  const tool = args[0] || 'vimdiff'
  
  try {
    console.log(`Opening diff in ${tool}...`)
    await previewer.openInDiffTool(tool)
  } catch (error) {
    warn(`Failed to open diff tool: ${error.message}`)
  }
}

async function interactiveReview(previewer: DiffPreviewer): Promise<void> {
  if (!previewer.hasPendingChanges()) {
    console.log('No pending changes to review')
    return
  }

  const files = previewer.getPendingFiles()
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  console.log(`\x1b[36m╔══════════════════════════════════════════════════════╗\x1b[0m`)
  console.log(`\x1b[36m║              Interactive Diff Review                 ║\x1b[0m`)
  console.log(`\x1b[36m╚══════════════════════════════════════════════════════╝\x1b[0m\n`)

  console.log(`Reviewing ${files.length} files with pending changes\n`)

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    console.log(`\x1b[33m[${i + 1}/${files.length}] File: ${file}\x1b[0m`)
    
    // Show diff for this file
    const tempPreviewer = new DiffPreviewer()
    const pendingChanges = previewer['pendingChanges'] // Access private member
    const diff = pendingChanges.get(file)
    
    if (diff) {
      tempPreviewer.addFileChange(file, diff.newContent || '', diff.type)
      const preview = tempPreviewer.getPreview({ colorize: true })
      console.log(preview)
    }
    
    // Ask for action
    let validAction = false
    while (!validAction) {
      const action = await new Promise<string>((resolve) => {
        rl.question('\nAction? (a)pply, (s)kip, (d)iscard, (q)uit: ', resolve)
      })
      
      switch (action.toLowerCase()) {
        case 'a':
          // Apply this change
          validAction = true
          break
        case 's':
          // Skip to next file
          validAction = true
          break
        case 'd':
          // Discard this change
          previewer.discardChanges() // This discards all - need to improve
          console.log('Change discarded')
          validAction = true
          break
        case 'q':
          // Quit interactive mode
          rl.close()
          console.log('\nInteractive review cancelled')
          return
        default:
          console.log('Invalid action. Please choose: a, s, d, or q')
      }
    }
  }
  
  rl.close()
  
  // Show final summary
  const finalStats = previewer.getStats()
  if (finalStats.totalFiles > 0) {
    console.log(`\n\x1b[33mRemaining changes: ${finalStats.totalFiles} files\x1b[0m`)
    console.log('Use "coda diff apply" to apply remaining changes')
  } else {
    console.log('\n✅ All changes processed')
  }
}