import { CommandHistory } from '../features/command-history.js'
import { SessionRecorder } from '../features/session-recorder.js'
import { CONFIG_PATHS } from '../config/paths.js'
import { log, warn } from '../utils/logging.js'
import * as fs from 'fs'
import * as path from 'path'

export async function showStatistics(): Promise<void> {
  const history = new CommandHistory()
  const stats = await history.getStatistics()

  console.log('\x1b[36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m')
  console.log('\x1b[36m║                      Coda Statistics                          ║\x1b[0m')
  console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
  
  console.log(`\x1b[36m║\x1b[0m Total Commands Run:      ${stats.totalCommands.toString().padEnd(36)} \x1b[36m║\x1b[0m`)
  console.log(`\x1b[36m║\x1b[0m Success Rate:            ${stats.successRate.toFixed(1)}%${' '.repeat(35 - stats.successRate.toFixed(1).length - 1)} \x1b[36m║\x1b[0m`)
  console.log(`\x1b[36m║\x1b[0m Average Duration:        ${formatDuration(stats.averageDuration).padEnd(36)} \x1b[36m║\x1b[0m`)
  
  console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
  console.log('\x1b[36m║                    Most Used Commands                         ║\x1b[0m')
  console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
  
  if (stats.mostUsedCommands.length === 0) {
    console.log('\x1b[36m║\x1b[0m No commands recorded yet                                      \x1b[36m║\x1b[0m')
  } else {
    stats.mostUsedCommands.forEach(({ command, count }) => {
      const line = `${command}: ${count} times`
      console.log(`\x1b[36m║\x1b[0m ${line.padEnd(61)} \x1b[36m║\x1b[0m`)
    })
  }
  
  // Show commands by project
  if (stats.commandsByProject.length > 0) {
    console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
    console.log('\x1b[36m║                   Commands by Project                         ║\x1b[0m')
    console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
    
    stats.commandsByProject.slice(0, 5).forEach(({ project, count }) => {
      const line = `${project}: ${count} commands`
      console.log(`\x1b[36m║\x1b[0m ${line.padEnd(61)} \x1b[36m║\x1b[0m`)
    })
  }
  
  console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
  console.log('\x1b[36m║                     Storage Usage                             ║\x1b[0m')
  console.log('\x1b[36m╠═══════════════════════════════════════════════════════════════╣\x1b[0m')
  
  const storageStats = await calculateStorageUsage()
  console.log(`\x1b[36m║\x1b[0m Config Directory:        ${storageStats.configDir.padEnd(36)} \x1b[36m║\x1b[0m`)
  console.log(`\x1b[36m║\x1b[0m Log Files:               ${storageStats.logs.padEnd(36)} \x1b[36m║\x1b[0m`)
  console.log(`\x1b[36m║\x1b[0m Session Records:         ${storageStats.sessions.padEnd(36)} \x1b[36m║\x1b[0m`)
  console.log(`\x1b[36m║\x1b[0m Total:                   ${storageStats.total.padEnd(36)} \x1b[36m║\x1b[0m`)
  
  console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m')
}

export async function showHistory(limit: number = 20): Promise<void> {
  const history = new CommandHistory()
  const entries = await history.getHistory(limit)

  console.log('\x1b[36m═══ Recent Command History ═══\x1b[0m\n')

  if (entries.length === 0) {
    console.log('No command history found.')
    return
  }

  entries.forEach((entry, index) => {
    const date = new Date(entry.timestamp)
    const timeStr = date.toLocaleString()
    const cmdStr = entry.command.join(' ')
    const statusIcon = entry.exitCode === 0 ? '✓' : entry.exitCode === undefined ? '?' : '✗'
    const statusColor = entry.exitCode === 0 ? '\x1b[32m' : entry.exitCode === undefined ? '\x1b[33m' : '\x1b[31m'
    
    console.log(`${statusColor}${statusIcon}\x1b[0m ${timeStr}${entry.projectName ? ` [${entry.projectName}]` : ''}`)
    console.log(`  ${cmdStr}`)
    if (entry.duration) {
      console.log(`  \x1b[90mDuration: ${formatDuration(entry.duration)}\x1b[0m`)
    }
    console.log()
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  } else {
    const minutes = Math.floor(ms / 60000)
    const seconds = ((ms % 60000) / 1000).toFixed(0)
    return `${minutes}m ${seconds}s`
  }
}

async function calculateStorageUsage(): Promise<{
  configDir: string
  logs: string
  sessions: string
  total: string
}> {
  const configDir = CONFIG_PATHS.getConfigDirectory()
  
  const getDirSize = (dir: string): number => {
    let size = 0
    try {
      const files = fs.readdirSync(dir)
      files.forEach(file => {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          size += getDirSize(filePath)
        } else {
          size += stat.size
        }
      })
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    return size
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const totalSize = getDirSize(configDir)
  const logsSize = getDirSize(path.join(configDir, 'logs'))
  const sessionsSize = getDirSize(path.join(configDir, 'sessions'))

  return {
    configDir: formatSize(totalSize - logsSize - sessionsSize),
    logs: formatSize(logsSize),
    sessions: formatSize(sessionsSize),
    total: formatSize(totalSize)
  }
}

export async function handleStatsCommand(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showStatsHelp()
    return
  }

  // Parse options
  const showSessions = args.includes('--sessions')
  const showHistory = args.includes('--history')
  const exportPath = getExportPath(args)
  const limit = getLimit(args) || 20

  try {
    if (showSessions) {
      await displaySessionStats()
    } else if (showHistory) {
      await showHistory(limit)
    } else if (exportPath) {
      await exportStats(exportPath)
    } else {
      // Default: show general statistics
      await showStatistics()
    }
  } catch (error) {
    console.error('Error displaying statistics:', error)
    process.exit(1)
  }
}

function showStatsHelp(): void {
  console.log('Usage: coda stats [options]')
  console.log('\nDisplay usage statistics and command history')
  console.log('\nOptions:')
  console.log('  --history          Show command history')
  console.log('  --sessions         Show session recording statistics')
  console.log('  --limit <n>        Limit number of items shown (default: 20)')
  console.log('  --export <path>    Export statistics to JSON file')
  console.log('  -h, --help         Show this help message')
  console.log('\nExamples:')
  console.log('  coda stats                     # Show general statistics')
  console.log('  coda stats --history           # Show command history')
  console.log('  coda stats --sessions          # Show session stats')
  console.log('  coda stats --export stats.json # Export stats to file')
}

function getExportPath(args: string[]): string | undefined {
  const exportIndex = args.indexOf('--export')
  if (exportIndex !== -1 && exportIndex + 1 < args.length) {
    return args[exportIndex + 1]
  }
  return undefined
}

function getLimit(args: string[]): number | undefined {
  const limitIndex = args.indexOf('--limit')
  if (limitIndex !== -1 && limitIndex + 1 < args.length) {
    const limit = parseInt(args[limitIndex + 1], 10)
    if (!isNaN(limit) && limit > 0) {
      return limit
    }
  }
  return undefined
}

async function displaySessionStats(): Promise<void> {
  const sessions = SessionRecorder.listSessions()
  
  console.log('\n📹 Session Recording Statistics')
  console.log('═══════════════════════════════════')
  console.log(`Total Sessions: ${sessions.length}`)
  
  if (sessions.length === 0) {
    console.log('No sessions recorded yet.')
    return
  }
  
  // Show recent sessions
  console.log('\n📅 Recent Sessions:')
  sessions.slice(0, 10).forEach((session, i) => {
    const time = new Date(session.startTime).toLocaleString()
    const duration = session.duration ? formatDuration(session.duration * 1000) : 'ongoing'
    const project = path.basename(session.projectPath)
    console.log(`  ${i + 1}. [${time}] ${project} - ${duration} (${session.eventsCount} events)`)
  })
}

async function exportStats(exportPath: string): Promise<void> {
  const history = new CommandHistory()
  const historyStats = await history.getStatistics()
  const sessions = SessionRecorder.listSessions()
  
  const exportData = {
    timestamp: new Date().toISOString(),
    commandHistory: historyStats,
    sessions: {
      total: sessions.length,
      sessions: sessions.slice(0, 100) // Limit to avoid huge exports
    }
  }
  
  try {
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2))
    log(`✅ Statistics exported to ${exportPath}`)
  } catch (error) {
    console.error('Failed to export statistics:', error)
    throw error
  }
}