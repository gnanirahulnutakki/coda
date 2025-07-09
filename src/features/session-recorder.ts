import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_PATHS } from '../config/paths.js'
import { errorLogger } from '../utils/error-logger.js'

export interface SessionEvent {
  timestamp: string
  type:
    | 'command'
    | 'output'
    | 'pattern_match'
    | 'file_edit'
    | 'error'
    | 'terminal_output'
    | 'response'
  data: any
}

export interface SessionMetadata {
  id: string
  startTime: string
  endTime?: string
  commandArgs: string[]
  projectPath: string
  duration?: number
  eventsCount: number
  exitCode?: number
}

export class SessionRecorder {
  private sessionId: string
  private sessionFile: string
  private metadataFile: string
  private events: SessionEvent[] = []
  private recording: boolean = false
  private metadata: SessionMetadata
  private eventCount = 0

  constructor(commandArgs: string[]) {
    this.sessionId = this.generateSessionId()
    const sessionsDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'sessions')

    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true })
    }

    this.sessionFile = path.join(sessionsDir, `${this.sessionId}.jsonl`)
    this.metadataFile = path.join(sessionsDir, `${this.sessionId}.meta.json`)

    this.metadata = {
      id: this.sessionId,
      startTime: new Date().toISOString(),
      commandArgs,
      projectPath: process.cwd(),
      eventsCount: 0,
    }
  }

  private generateSessionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }

  startRecording(): void {
    if (this.recording) {
      return
    }

    this.recording = true
    this.saveMetadata()

    this.recordEvent('command', {
      args: this.metadata.commandArgs,
      cwd: this.metadata.projectPath,
      env: {
        NODE_VERSION: process.version,
        PLATFORM: process.platform,
        ARCH: process.arch,
      },
    })

    errorLogger.debug('Session recording started:', this.sessionId)
  }

  stopRecording(exitCode?: number): void {
    if (!this.recording) {
      return
    }

    this.recording = false
    this.flush()

    // Update final metadata
    this.metadata.endTime = new Date().toISOString()
    if (this.metadata.startTime) {
      const start = new Date(this.metadata.startTime).getTime()
      const end = new Date(this.metadata.endTime).getTime()
      this.metadata.duration = (end - start) / 1000 // duration in seconds
    }
    this.metadata.eventsCount = this.eventCount
    this.metadata.exitCode = exitCode

    this.saveMetadata()

    errorLogger.debug('Session recording stopped:', this.sessionId)
  }

  recordEvent(type: SessionEvent['type'], data: any): void {
    if (!this.recording) return

    const event: SessionEvent = {
      timestamp: new Date().toISOString(),
      type,
      data,
    }

    this.events.push(event)
    this.eventCount++

    // Flush every 100 events
    if (this.events.length >= 100) {
      this.flush()
    }
  }

  recordPatternMatch(patternId: string, matched: boolean, response?: any): void {
    this.recordEvent('pattern_match', {
      patternId,
      matched,
      response,
    })
  }

  recordError(error: Error): void {
    this.recordEvent('error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
  }

  private flush(): void {
    if (this.events.length === 0) return

    try {
      const lines = this.events.map((event) => JSON.stringify(event) + '\n').join('')
      fs.appendFileSync(this.sessionFile, lines)
      this.events = []
    } catch (error) {
      errorLogger.warn('Failed to write session events', error as Error)
    }
  }

  getSessionId(): string {
    return this.sessionId
  }

  getSessionFile(): string {
    return this.sessionFile
  }

  private saveMetadata(): void {
    try {
      fs.writeFileSync(this.metadataFile, JSON.stringify(this.metadata, null, 2))
    } catch (error) {
      errorLogger.error('Failed to save session metadata:', error)
    }
  }

  // Static methods for session management
  static listSessions(): SessionMetadata[] {
    const sessionDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'sessions')

    if (!fs.existsSync(sessionDir)) {
      return []
    }

    try {
      const files = fs.readdirSync(sessionDir)
      const metaFiles = files.filter((f) => f.endsWith('.meta.json'))

      return metaFiles
        .map((file) => {
          const content = fs.readFileSync(path.join(sessionDir, file), 'utf8')
          return JSON.parse(content) as SessionMetadata
        })
        .sort((a, b) => b.startTime.localeCompare(a.startTime))
    } catch (error) {
      errorLogger.error('Failed to list sessions:', error)
      return []
    }
  }

  static loadSession(sessionId: string): SessionEvent[] {
    const sessionDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'sessions')
    const sessionFile = path.join(sessionDir, `${sessionId}.jsonl`)

    if (!fs.existsSync(sessionFile)) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    try {
      const content = fs.readFileSync(sessionFile, 'utf8')
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as SessionEvent)
    } catch (error) {
      errorLogger.error('Failed to load session:', error)
      throw error
    }
  }

  static deleteOldSessions(daysToKeep: number = 30): void {
    const sessionDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'sessions')

    if (!fs.existsSync(sessionDir)) {
      return
    }

    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000

    try {
      const files = fs.readdirSync(sessionDir)

      files.forEach((file) => {
        const filePath = path.join(sessionDir, file)
        const stats = fs.statSync(filePath)

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath)
          errorLogger.debug('Deleted old session file:', file)
        }
      })
    } catch (error) {
      errorLogger.error('Failed to delete old sessions:', error)
    }
  }
}
