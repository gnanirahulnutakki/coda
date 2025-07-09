import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { CONFIG_PATHS } from '../config/paths.js'

export interface FileSnapshot {
  path: string
  content: string
  hash: string
  lastModified: number
}

export interface Checkpoint {
  id: string
  timestamp: string
  description: string
  files: FileSnapshot[]
  metadata: {
    project: string
    cwd: string
    command?: string
    provider?: string
  }
}

export class CheckpointManager {
  private checkpointsDir: string
  private projectId: string
  private currentProject: string

  constructor() {
    const configDir = CONFIG_PATHS.getConfigDirectory()
    this.checkpointsDir = path.join(configDir, 'checkpoints')
    this.ensureCheckpointsDirectory()
  }

  async initializeProject(projectPath: string): Promise<void> {
    this.currentProject = projectPath
    this.projectId = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '')
  }

  private ensureCheckpointsDirectory(): void {
    if (!fs.existsSync(this.checkpointsDir)) {
      fs.mkdirSync(this.checkpointsDir, { recursive: true })
    }
  }

  private getProjectCheckpointsPath(): string {
    if (!this.projectId) {
      throw new Error('No project initialized')
    }
    const projectCheckpointsPath = path.join(this.checkpointsDir, `${this.projectId}.json`)
    return projectCheckpointsPath
  }

  private loadCheckpoints(): Checkpoint[] {
    const checkpointsPath = this.getProjectCheckpointsPath()
    
    if (!fs.existsSync(checkpointsPath)) {
      return []
    }

    try {
      const data = fs.readFileSync(checkpointsPath, 'utf8')
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      console.warn('Failed to load checkpoints, starting fresh:', error.message)
      return []
    }
  }

  private saveCheckpoints(checkpoints: Checkpoint[]): void {
    const checkpointsPath = this.getProjectCheckpointsPath()
    
    // Keep only the last 50 checkpoints to prevent excessive storage
    const limitedCheckpoints = checkpoints.slice(-50)
    
    fs.writeFileSync(checkpointsPath, JSON.stringify(limitedCheckpoints, null, 2))
  }

  private calculateFileHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private captureFileSnapshot(filePath: string): FileSnapshot | null {
    try {
      const absolutePath = path.resolve(filePath)
      
      if (!fs.existsSync(absolutePath)) {
        return null
      }

      const stats = fs.statSync(absolutePath)
      if (!stats.isFile()) {
        return null
      }

      const content = fs.readFileSync(absolutePath, 'utf8')
      const hash = this.calculateFileHash(content)

      return {
        path: filePath,
        content,
        hash,
        lastModified: stats.mtime.getTime()
      }
    } catch (error) {
      console.warn(`Failed to capture snapshot of ${filePath}:`, error.message)
      return null
    }
  }

  async createCheckpoint(description: string, filePaths: string[], metadata?: Partial<Checkpoint['metadata']>): Promise<string> {
    if (!this.currentProject) {
      throw new Error('No project initialized')
    }

    const id = crypto.randomBytes(8).toString('hex')
    const timestamp = new Date().toISOString()
    
    const files: FileSnapshot[] = []
    
    for (const filePath of filePaths) {
      const snapshot = this.captureFileSnapshot(filePath)
      if (snapshot) {
        files.push(snapshot)
      }
    }

    if (files.length === 0) {
      throw new Error('No valid files found to checkpoint')
    }

    const checkpoint: Checkpoint = {
      id,
      timestamp,
      description,
      files,
      metadata: {
        project: path.basename(this.currentProject),
        cwd: this.currentProject,
        ...metadata
      }
    }

    const checkpoints = this.loadCheckpoints()
    checkpoints.push(checkpoint)
    this.saveCheckpoints(checkpoints)

    return id
  }

  async createAutoCheckpoint(filePaths: string[], command?: string): Promise<string> {
    const description = `Auto-checkpoint before AI changes${command ? `: ${command}` : ''}`
    return this.createCheckpoint(description, filePaths, { command })
  }

  listCheckpoints(limit?: number): Checkpoint[] {
    const checkpoints = this.loadCheckpoints()
    
    // Sort by timestamp (newest first)
    checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    
    return limit ? checkpoints.slice(0, limit) : checkpoints
  }

  getCheckpoint(id: string): Checkpoint | null {
    const checkpoints = this.loadCheckpoints()
    return checkpoints.find(cp => cp.id === id) || null
  }

  async rollbackToCheckpoint(id: string, options: { dryRun?: boolean } = {}): Promise<{ success: boolean; files: string[]; errors: string[] }> {
    const checkpoint = this.getCheckpoint(id)
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${id} not found`)
    }

    const restoredFiles: string[] = []
    const errors: string[] = []

    for (const fileSnapshot of checkpoint.files) {
      try {
        const absolutePath = path.resolve(fileSnapshot.path)
        
        if (options.dryRun) {
          // In dry run mode, just check if we can write to the file
          if (fs.existsSync(absolutePath)) {
            const stats = fs.statSync(absolutePath)
            if (!stats.isFile()) {
              errors.push(`${fileSnapshot.path}: Not a file`)
              continue
            }
          }
          restoredFiles.push(fileSnapshot.path)
          continue
        }

        // Ensure the directory exists
        const dir = path.dirname(absolutePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }

        // Restore the file content
        fs.writeFileSync(absolutePath, fileSnapshot.content)
        restoredFiles.push(fileSnapshot.path)
        
      } catch (error) {
        errors.push(`${fileSnapshot.path}: ${error.message}`)
      }
    }

    return {
      success: errors.length === 0,
      files: restoredFiles,
      errors
    }
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    const checkpoints = this.loadCheckpoints()
    const initialLength = checkpoints.length
    
    const filtered = checkpoints.filter(cp => cp.id !== id)
    
    if (filtered.length === initialLength) {
      return false // Checkpoint not found
    }

    this.saveCheckpoints(filtered)
    return true
  }

  async cleanupOldCheckpoints(maxAgeDays: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays)
    
    const checkpoints = this.loadCheckpoints()
    const filtered = checkpoints.filter(cp => 
      new Date(cp.timestamp) >= cutoffDate
    )
    
    const removedCount = checkpoints.length - filtered.length
    
    if (removedCount > 0) {
      this.saveCheckpoints(filtered)
    }
    
    return removedCount
  }

  async exportCheckpoint(id: string, outputPath: string): Promise<void> {
    const checkpoint = this.getCheckpoint(id)
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${id} not found`)
    }

    fs.writeFileSync(outputPath, JSON.stringify(checkpoint, null, 2))
  }

  async importCheckpoint(inputPath: string): Promise<string> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Import file not found: ${inputPath}`)
    }

    const data = fs.readFileSync(inputPath, 'utf8')
    const checkpoint: Checkpoint = JSON.parse(data)
    
    // Validate checkpoint structure
    if (!checkpoint.id || !checkpoint.timestamp || !checkpoint.files || !Array.isArray(checkpoint.files) || !checkpoint.metadata) {
      throw new Error('Invalid checkpoint file format')
    }

    // Generate new ID to avoid conflicts
    const newId = crypto.randomBytes(8).toString('hex')
    checkpoint.id = newId
    checkpoint.description = `${checkpoint.description} (imported)`

    const checkpoints = this.loadCheckpoints()
    checkpoints.push(checkpoint)
    this.saveCheckpoints(checkpoints)

    return newId
  }

  getDiffSummary(id: string): { file: string; changed: boolean; reason: string }[] {
    const checkpoint = this.getCheckpoint(id)
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${id} not found`)
    }

    return checkpoint.files.map(fileSnapshot => {
      const absolutePath = path.resolve(fileSnapshot.path)
      
      if (!fs.existsSync(absolutePath)) {
        return {
          file: fileSnapshot.path,
          changed: true,
          reason: 'File deleted since checkpoint'
        }
      }

      try {
        const currentContent = fs.readFileSync(absolutePath, 'utf8')
        const currentHash = this.calculateFileHash(currentContent)
        
        return {
          file: fileSnapshot.path,
          changed: currentHash !== fileSnapshot.hash,
          reason: currentHash !== fileSnapshot.hash ? 'Content modified' : 'No changes'
        }
      } catch (error) {
        return {
          file: fileSnapshot.path,
          changed: true,
          reason: `Error reading file: ${error.message}`
        }
      }
    })
  }
}