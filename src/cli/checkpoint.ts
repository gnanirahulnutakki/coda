import { CheckpointManager } from '../features/checkpoint.js'
import { log, warn } from '../utils/logging.js'
import * as fs from 'fs'

export async function handleCheckpointCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command) {
    console.log('Checkpoint management commands:')
    console.log('  coda checkpoint create <description> [files...] - Create a new checkpoint')
    console.log(
      '  coda checkpoint list [limit]                    - List checkpoints (newest first)',
    )
    console.log('  coda checkpoint show <id>                       - Show checkpoint details')
    console.log('  coda checkpoint rollback <id> [--dry-run]       - Rollback to checkpoint')
    console.log('  coda checkpoint delete <id>                     - Delete a checkpoint')
    console.log(
      '  coda checkpoint diff <id>                       - Show what changed since checkpoint',
    )
    console.log('  coda checkpoint export <id> <file>              - Export checkpoint to file')
    console.log('  coda checkpoint import <file>                   - Import checkpoint from file')
    console.log(
      '  coda checkpoint cleanup [days]                  - Clean up old checkpoints (default: 30 days)',
    )
    console.log(
      '  coda checkpoint auto [files...]                 - Create auto-checkpoint before changes',
    )
    return
  }

  const manager = new CheckpointManager()
  await manager.initializeProject(process.cwd())

  switch (command) {
    case 'create':
      await createCheckpoint(manager, args.slice(1))
      break
    case 'list':
      await listCheckpoints(manager, args[1])
      break
    case 'show':
      await showCheckpoint(manager, args[1])
      break
    case 'rollback':
      await rollbackCheckpoint(manager, args.slice(1))
      break
    case 'delete':
      await deleteCheckpoint(manager, args[1])
      break
    case 'diff':
      await showDiff(manager, args[1])
      break
    case 'export':
      await exportCheckpoint(manager, args[1], args[2])
      break
    case 'import':
      await importCheckpoint(manager, args[1])
      break
    case 'cleanup':
      await cleanupCheckpoints(manager, args[1])
      break
    case 'auto':
      await createAutoCheckpoint(manager, args.slice(1))
      break
    default:
      warn(`Unknown checkpoint command: ${command}`)
      break
  }
}

async function createCheckpoint(manager: CheckpointManager, args: string[]): Promise<void> {
  const description = args[0]
  const files = args.slice(1)

  if (!description) {
    warn('Please provide a description for the checkpoint')
    return
  }

  if (files.length === 0) {
    warn('Please specify files to include in the checkpoint')
    return
  }

  // Validate that files exist
  const existingFiles = files.filter((file) => fs.existsSync(file))
  const missingFiles = files.filter((file) => !fs.existsSync(file))

  if (missingFiles.length > 0) {
    warn(`Warning: Some files do not exist: ${missingFiles.join(', ')}`)
  }

  if (existingFiles.length === 0) {
    warn('No valid files found to checkpoint')
    return
  }

  try {
    const id = await manager.createCheckpoint(description, existingFiles)
    log(`✅ Checkpoint created: ${id}`)
    log(`   Description: ${description}`)
    log(`   Files: ${existingFiles.length}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to create checkpoint: ${errorMessage}`)
  }
}

async function listCheckpoints(manager: CheckpointManager, limitStr?: string): Promise<void> {
  const limit = limitStr ? parseInt(limitStr, 10) : undefined

  if (limitStr && (isNaN(limit as number) || (limit as number) <= 0)) {
    warn('Limit must be a positive number')
    return
  }

  try {
    const checkpoints = manager.listCheckpoints(limit)

    if (checkpoints.length === 0) {
      console.log('No checkpoints found for this project.')
      return
    }

    console.log('\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m')
    console.log('\\x1b[36m║                    Checkpoints                       ║\\x1b[0m')
    console.log('\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n')

    checkpoints.forEach((checkpoint, index) => {
      const date = new Date(checkpoint.timestamp).toLocaleString()
      const fileCount = checkpoint.files.length

      console.log(`${index + 1}. \\x1b[33m${checkpoint.id}\\x1b[0m`)
      console.log(`   📅 ${date}`)
      console.log(`   📝 ${checkpoint.description}`)
      console.log(`   📁 ${fileCount} file${fileCount !== 1 ? 's' : ''}`)

      if (checkpoint.metadata.command) {
        console.log(`   💻 ${checkpoint.metadata.command}`)
      }
      console.log()
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to list checkpoints: ${errorMessage}`)
  }
}

async function showCheckpoint(manager: CheckpointManager, id?: string): Promise<void> {
  if (!id) {
    warn('Please provide a checkpoint ID')
    return
  }

  try {
    const checkpoint = manager.getCheckpoint(id)

    if (!checkpoint) {
      warn(`Checkpoint ${id} not found`)
      return
    }

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                 Checkpoint Details                   ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    console.log(`\\x1b[33mID:\\x1b[0m ${checkpoint.id}`)
    console.log(`\\x1b[33mTimestamp:\\x1b[0m ${new Date(checkpoint.timestamp).toLocaleString()}`)
    console.log(`\\x1b[33mDescription:\\x1b[0m ${checkpoint.description}`)
    console.log(`\\x1b[33mProject:\\x1b[0m ${checkpoint.metadata.project}`)

    if (checkpoint.metadata.command) {
      console.log(`\\x1b[33mCommand:\\x1b[0m ${checkpoint.metadata.command}`)
    }
    if (checkpoint.metadata.provider) {
      console.log(`\\x1b[33mProvider:\\x1b[0m ${checkpoint.metadata.provider}`)
    }

    console.log(`\\n\\x1b[33mFiles (${checkpoint.files.length}):\\x1b[0m`)
    checkpoint.files.forEach((file) => {
      const size = Buffer.byteLength(file.content, 'utf8')
      const date = new Date(file.lastModified).toLocaleString()
      console.log(`  📄 ${file.path}`)
      console.log(`     Size: ${size} bytes, Modified: ${date}`)
      console.log(`     Hash: ${file.hash.substring(0, 16)}...`)
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to show checkpoint: ${errorMessage}`)
  }
}

async function rollbackCheckpoint(manager: CheckpointManager, args: string[]): Promise<void> {
  const id = args[0]
  const dryRun = args.includes('--dry-run')

  if (!id) {
    warn('Please provide a checkpoint ID')
    return
  }

  try {
    console.log(`${dryRun ? '🔍 Dry run: ' : '🔄 '}Rolling back to checkpoint ${id}...`)

    const result = await manager.rollbackToCheckpoint(id, { dryRun })

    if (result.success) {
      if (dryRun) {
        log(`✅ Dry run successful - would restore ${result.files.length} files:`)
      } else {
        log(`✅ Rollback successful - restored ${result.files.length} files:`)
      }

      result.files.forEach((file) => {
        console.log(`  ✓ ${file}`)
      })
    } else {
      warn(`❌ Rollback ${dryRun ? 'dry run ' : ''}completed with errors:`)
      result.errors.forEach((error) => {
        console.log(`  ❌ ${error}`)
      })

      if (result.files.length > 0) {
        console.log(`\\nSuccessfully ${dryRun ? 'checked' : 'restored'}:`)
        result.files.forEach((file) => {
          console.log(`  ✓ ${file}`)
        })
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to rollback: ${errorMessage}`)
  }
}

async function deleteCheckpoint(manager: CheckpointManager, id?: string): Promise<void> {
  if (!id) {
    warn('Please provide a checkpoint ID')
    return
  }

  try {
    const success = await manager.deleteCheckpoint(id)

    if (success) {
      log(`✅ Checkpoint ${id} deleted`)
    } else {
      warn(`Checkpoint ${id} not found`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to delete checkpoint: ${errorMessage}`)
  }
}

async function showDiff(manager: CheckpointManager, id?: string): Promise<void> {
  if (!id) {
    warn('Please provide a checkpoint ID')
    return
  }

  try {
    const diff = manager.getDiffSummary(id)

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║             Changes Since Checkpoint                ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    const changed = diff.filter((item) => item.changed)
    const unchanged = diff.filter((item) => !item.changed)

    if (changed.length > 0) {
      console.log(`\\x1b[31m📝 Changed (${changed.length}):\\x1b[0m`)
      changed.forEach((item) => {
        console.log(`  ❌ ${item.file} - ${item.reason}`)
      })
      console.log()
    }

    if (unchanged.length > 0) {
      console.log(`\\x1b[32m✅ Unchanged (${unchanged.length}):\\x1b[0m`)
      unchanged.forEach((item) => {
        console.log(`  ✓ ${item.file}`)
      })
    }

    if (changed.length === 0) {
      console.log('\\x1b[32m🎉 No changes detected since checkpoint!\\x1b[0m')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to get diff: ${errorMessage}`)
  }
}

async function exportCheckpoint(
  manager: CheckpointManager,
  id?: string,
  outputPath?: string,
): Promise<void> {
  if (!id) {
    warn('Please provide a checkpoint ID')
    return
  }

  if (!outputPath) {
    warn('Please provide an output file path')
    return
  }

  try {
    await manager.exportCheckpoint(id, outputPath)
    log(`✅ Checkpoint exported to: ${outputPath}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to export checkpoint: ${errorMessage}`)
  }
}

async function importCheckpoint(manager: CheckpointManager, inputPath?: string): Promise<void> {
  if (!inputPath) {
    warn('Please provide an input file path')
    return
  }

  try {
    const newId = await manager.importCheckpoint(inputPath)
    log(`✅ Checkpoint imported with ID: ${newId}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to import checkpoint: ${errorMessage}`)
  }
}

async function cleanupCheckpoints(manager: CheckpointManager, daysStr?: string): Promise<void> {
  const days = daysStr ? parseInt(daysStr, 10) : 30

  if (isNaN(days) || days <= 0) {
    warn('Days must be a positive number')
    return
  }

  try {
    const removedCount = await manager.cleanupOldCheckpoints(days)

    if (removedCount > 0) {
      log(`✅ Cleaned up ${removedCount} old checkpoint${removedCount !== 1 ? 's' : ''}`)
    } else {
      log('No old checkpoints found to clean up')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to cleanup checkpoints: ${errorMessage}`)
  }
}

async function createAutoCheckpoint(manager: CheckpointManager, files: string[]): Promise<void> {
  if (files.length === 0) {
    // If no files specified, try to find common project files
    const commonFiles = [
      'package.json',
      'src',
      'lib',
      'index.js',
      'index.ts',
      'main.js',
      'main.ts',
    ].filter((file) => fs.existsSync(file))

    if (commonFiles.length === 0) {
      warn('No files specified and no common project files found')
      warn('Usage: coda checkpoint auto <files...>')
      return
    }

    files = commonFiles
  }

  // Validate that files exist
  const existingFiles = files.filter((file) => fs.existsSync(file))

  if (existingFiles.length === 0) {
    warn('No valid files found to checkpoint')
    return
  }

  try {
    const id = await manager.createAutoCheckpoint(existingFiles)
    log(`✅ Auto-checkpoint created: ${id}`)
    log(`   Files: ${existingFiles.join(', ')}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    warn(`Failed to create auto-checkpoint: ${errorMessage}`)
  }
}
