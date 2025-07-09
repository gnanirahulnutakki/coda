import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_PATHS } from '../config/paths.js'
import { log, warn } from '../utils/logging.js'
import { errorLogger } from '../utils/error-logger.js'

export interface ContextEntry {
  id: string
  timestamp: string
  type: 'file_edit' | 'command' | 'decision' | 'explanation' | 'error'
  content: string
  metadata?: {
    file?: string
    command?: string
    cwd?: string
    project?: string
    provider?: string
    tokens?: number
  }
}

export interface ProjectContext {
  projectId: string
  projectPath: string
  lastUpdated: string
  entries: ContextEntry[]
  summary?: string
  keyDecisions?: string[]
  architecture?: string
}

export class ContextMemory {
  private memoryDir: string
  private currentProject: ProjectContext | null = null
  private maxEntriesPerProject = 1000
  private maxMemoryAgeDays = 90

  constructor() {
    this.memoryDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'memory')
    this.ensureMemoryDirectory()
  }

  private ensureMemoryDirectory(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true })
    }
  }

  /**
   * Load or create project context
   */
  async loadProjectContext(projectPath: string): Promise<ProjectContext> {
    const projectId = this.getProjectId(projectPath)
    const contextFile = path.join(this.memoryDir, `${projectId}.json`)

    if (fs.existsSync(contextFile)) {
      try {
        const data = fs.readFileSync(contextFile, 'utf-8')
        this.currentProject = JSON.parse(data)
        log(`※ Loaded context memory for project: ${path.basename(projectPath)}`)
        return this.currentProject!
      } catch (error) {
        errorLogger.warn('Failed to load project context', error as Error)
      }
    }

    // Create new context
    this.currentProject = {
      projectId,
      projectPath,
      lastUpdated: new Date().toISOString(),
      entries: []
    }

    await this.saveProjectContext()
    return this.currentProject
  }

  /**
   * Add entry to current project context
   */
  async addEntry(entry: Omit<ContextEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.currentProject) {
      warn('※ No project context loaded')
      return
    }

    const newEntry: ContextEntry = {
      id: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...entry
    }

    this.currentProject.entries.push(newEntry)
    this.currentProject.lastUpdated = new Date().toISOString()

    // Trim old entries if needed
    if (this.currentProject.entries.length > this.maxEntriesPerProject) {
      this.currentProject.entries = this.currentProject.entries.slice(-this.maxEntriesPerProject)
    }

    await this.saveProjectContext()
  }

  /**
   * Get recent context for AI
   */
  getRecentContext(limit: number = 20): ContextEntry[] {
    if (!this.currentProject) return []
    
    return this.currentProject.entries
      .slice(-limit)
      .reverse()
  }

  /**
   * Search context by type or content
   */
  searchContext(query: string, type?: ContextEntry['type']): ContextEntry[] {
    if (!this.currentProject) return []

    const queryLower = query.toLowerCase()
    
    return this.currentProject.entries.filter(entry => {
      if (type && entry.type !== type) return false
      
      return entry.content.toLowerCase().includes(queryLower) ||
        entry.metadata?.file?.toLowerCase().includes(queryLower) ||
        entry.metadata?.command?.toLowerCase().includes(queryLower)
    })
  }

  /**
   * Update project summary and key decisions
   */
  async updateProjectMetadata(metadata: {
    summary?: string
    keyDecisions?: string[]
    architecture?: string
  }): Promise<void> {
    if (!this.currentProject) return

    if (metadata.summary) {
      this.currentProject.summary = metadata.summary
    }
    if (metadata.keyDecisions) {
      this.currentProject.keyDecisions = metadata.keyDecisions
    }
    if (metadata.architecture) {
      this.currentProject.architecture = metadata.architecture
    }

    this.currentProject.lastUpdated = new Date().toISOString()
    await this.saveProjectContext()
  }

  /**
   * Get context summary for AI injection
   */
  getContextSummary(): string {
    if (!this.currentProject) return ''

    let summary = `# Project Context Memory\n\n`
    
    if (this.currentProject.summary) {
      summary += `## Project Summary\n${this.currentProject.summary}\n\n`
    }

    if (this.currentProject.architecture) {
      summary += `## Architecture\n${this.currentProject.architecture}\n\n`
    }

    if (this.currentProject.keyDecisions && this.currentProject.keyDecisions.length > 0) {
      summary += `## Key Decisions\n`
      this.currentProject.keyDecisions.forEach(decision => {
        summary += `- ${decision}\n`
      })
      summary += '\n'
    }

    // Add recent file edits
    const recentEdits = this.currentProject.entries
      .filter(e => e.type === 'file_edit')
      .slice(-10)
      .reverse()

    if (recentEdits.length > 0) {
      summary += `## Recent File Edits\n`
      recentEdits.forEach(edit => {
        summary += `- ${edit.metadata?.file}: ${edit.content.substring(0, 100)}...\n`
      })
      summary += '\n'
    }

    // Add recent commands
    const recentCommands = this.currentProject.entries
      .filter(e => e.type === 'command')
      .slice(-10)
      .reverse()

    if (recentCommands.length > 0) {
      summary += `## Recent Commands\n`
      recentCommands.forEach(cmd => {
        summary += `- ${cmd.metadata?.command}\n`
      })
    }

    return summary
  }

  /**
   * Clean up old memory files
   */
  async cleanupOldMemory(): Promise<void> {
    const files = fs.readdirSync(this.memoryDir)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.maxMemoryAgeDays)

    for (const file of files) {
      if (!file.endsWith('.json')) continue

      const filePath = path.join(this.memoryDir, file)
      const stats = fs.statSync(filePath)

      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath)
        log(`※ Cleaned up old memory file: ${file}`)
      }
    }
  }

  /**
   * Export memory for backup or sharing
   */
  async exportMemory(outputPath: string): Promise<void> {
    if (!this.currentProject) {
      throw new Error('No project context loaded')
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.currentProject, null, 2))
    log(`※ Exported memory to: ${outputPath}`)
  }

  /**
   * Import memory from backup
   */
  async importMemory(inputPath: string): Promise<void> {
    const data = fs.readFileSync(inputPath, 'utf-8')
    const imported = JSON.parse(data) as ProjectContext

    // Validate structure
    if (!imported.projectId || !imported.entries || !Array.isArray(imported.entries)) {
      throw new Error('Invalid memory file format')
    }

    this.currentProject = imported
    await this.saveProjectContext()
    log(`※ Imported memory from: ${inputPath}`)
  }

  private getProjectId(projectPath: string): string {
    // Create a stable ID based on project path
    const normalized = path.resolve(projectPath)
    return Buffer.from(normalized).toString('base64').replace(/[/+=]/g, '')
  }

  private async saveProjectContext(): Promise<void> {
    if (!this.currentProject) return

    const contextFile = path.join(this.memoryDir, `${this.currentProject.projectId}.json`)
    
    try {
      fs.writeFileSync(contextFile, JSON.stringify(this.currentProject, null, 2))
    } catch (error) {
      errorLogger.error('Failed to save project context', error as Error)
    }
  }
}