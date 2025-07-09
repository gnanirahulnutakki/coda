import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { CONFIG_PATHS } from '../config/paths.js'
import { errorLogger } from '../utils/error-logger.js'

export interface HistoryEntry {
  id: string
  timestamp: string
  command: string[]
  cwd: string
  exitCode?: number
  duration?: number
  success?: boolean
  projectName?: string
}

export class CommandHistory {
  private historyFile: string
  private maxEntries: number = 1000

  constructor() {
    this.historyFile = path.join(CONFIG_PATHS.getConfigDirectory(), 'command-history.jsonl')
  }

  async addEntry(command: string[], startTime: number, exitCode?: number): Promise<void> {
    const entry: HistoryEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      command,
      cwd: process.cwd(),
      exitCode,
      duration: Date.now() - startTime,
      success: exitCode === 0 || exitCode === undefined,
      projectName: path.basename(process.cwd()),
    }

    try {
      fs.appendFileSync(this.historyFile, JSON.stringify(entry) + '\n')
      await this.trimHistory()
    } catch (error) {
      errorLogger.debug('Failed to write command history', error as Error)
    }
  }

  private generateId(): string {
    return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  async getHistory(limit: number = 50): Promise<HistoryEntry[]> {
    if (!fs.existsSync(this.historyFile)) {
      return []
    }

    const entries: HistoryEntry[] = []
    const fileStream = fs.createReadStream(this.historyFile)
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      try {
        const entry = JSON.parse(line)
        entries.push(entry)
      } catch (error) {
        // Skip invalid lines
      }
    }

    return entries.slice(-limit)
  }

  async searchHistory(query: string): Promise<HistoryEntry[]> {
    const allEntries = await this.getHistory(this.maxEntries)
    return allEntries.filter((entry) =>
      entry.command.join(' ').toLowerCase().includes(query.toLowerCase()),
    )
  }

  async getStatistics(): Promise<{
    totalCommands: number
    successRate: number
    averageDuration: number
    mostUsedCommands: { command: string; count: number }[]
    recentFailures: HistoryEntry[]
    commandsByProject: { project: string; count: number }[]
  }> {
    const entries = await this.getHistory(this.maxEntries)

    const stats = {
      totalCommands: entries.length,
      successRate: 0,
      averageDuration: 0,
      mostUsedCommands: [] as { command: string; count: number }[],
      recentFailures: [] as HistoryEntry[],
      commandsByProject: [] as { project: string; count: number }[],
    }

    if (entries.length === 0) return stats

    // Calculate success rate
    const entriesWithExitCode = entries.filter((e) => e.exitCode !== undefined)
    const successfulCommands = entriesWithExitCode.filter((e) => e.exitCode === 0)
    stats.successRate =
      entriesWithExitCode.length > 0
        ? (successfulCommands.length / entriesWithExitCode.length) * 100
        : 0

    // Calculate average duration
    const entriesWithDuration = entries.filter((e) => e.duration !== undefined)
    const totalDuration = entriesWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0)
    stats.averageDuration =
      entriesWithDuration.length > 0 ? totalDuration / entriesWithDuration.length : 0

    // Find most used commands
    const commandCounts = new Map<string, number>()
    entries.forEach((entry) => {
      const cmdStr = entry.command[0] || 'unknown'
      commandCounts.set(cmdStr, (commandCounts.get(cmdStr) || 0) + 1)
    })

    stats.mostUsedCommands = Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get recent failures
    stats.recentFailures = entries
      .filter((e) => e.success === false)
      .reverse()
      .slice(0, 10)

    // Get commands by project
    const projectCounts = new Map<string, number>()
    entries.forEach((entry) => {
      const project = entry.projectName || 'unknown'
      projectCounts.set(project, (projectCounts.get(project) || 0) + 1)
    })

    stats.commandsByProject = Array.from(projectCounts.entries())
      .map(([project, count]) => ({ project, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return stats
  }

  private async trimHistory(): Promise<void> {
    try {
      const entries = await this.getHistory(this.maxEntries * 2)
      if (entries.length > this.maxEntries) {
        const keepEntries = entries.slice(-this.maxEntries)
        const content = keepEntries.map((e) => JSON.stringify(e) + '\n').join('')
        fs.writeFileSync(this.historyFile, content)
      }
    } catch (error) {
      errorLogger.debug('Failed to trim command history', error as Error)
    }
  }

  // Export history to JSON file
  async exportHistory(outputPath: string): Promise<void> {
    const entries = await this.getHistory(this.maxEntries)

    try {
      fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2))
      errorLogger.info(`Exported ${entries.length} history entries to ${outputPath}`)
    } catch (error) {
      errorLogger.error('Failed to export command history:', error)
      throw error
    }
  }

  // Import history from JSON file
  async importHistory(inputPath: string, merge: boolean = true): Promise<void> {
    try {
      const content = fs.readFileSync(inputPath, 'utf8')
      const entries = JSON.parse(content) as HistoryEntry[]

      // Validate entries
      for (const entry of entries) {
        if (!entry.timestamp || !entry.command || !Array.isArray(entry.command)) {
          throw new Error('Invalid history entry format')
        }
      }

      if (!merge) {
        // Clear existing history
        fs.writeFileSync(this.historyFile, '')
      }

      // Append imported entries
      const lines = entries.map((entry) => JSON.stringify(entry) + '\n').join('')
      fs.appendFileSync(this.historyFile, lines)

      // Trim if needed
      await this.trimHistory()

      errorLogger.info(`Imported ${entries.length} history entries from ${inputPath}`)
    } catch (error) {
      errorLogger.error('Failed to import command history:', error)
      throw error
    }
  }

  // Clear all history
  async clearHistory(): Promise<void> {
    try {
      if (fs.existsSync(this.historyFile)) {
        fs.unlinkSync(this.historyFile)
        errorLogger.info('Command history cleared')
      }
    } catch (error) {
      errorLogger.error('Failed to clear command history:', error)
      throw error
    }
  }
}
