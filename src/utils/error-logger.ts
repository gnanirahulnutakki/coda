import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CONFIG_PATHS } from '../config/paths'

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class ErrorLogger {
  private static instance: ErrorLogger
  private logLevel: LogLevel = LogLevel.INFO
  private logFile?: string
  private debugMode: boolean = false

  private constructor() {
    this.initializeLogFile()
  }

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger()
    }
    return ErrorLogger.instance
  }

  private initializeLogFile(): void {
    try {
      const logsDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'logs')
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }

      const timestamp = new Date().toISOString().split('T')[0]
      this.logFile = path.join(logsDir, `coda-${timestamp}.log`)
    } catch (error) {
      // If we can't create log file, just log to console
      console.warn('Failed to initialize log file:', error)
    }
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logLevel = enabled ? LogLevel.DEBUG : LogLevel.INFO
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  private formatMessage(level: string, message: string, error?: Error): string {
    const timestamp = new Date().toISOString()
    const errorStack = error ? `\n${error.stack}` : ''
    return `[${timestamp}] [${level}] ${message}${errorStack}\n`
  }

  private writeToFile(message: string): void {
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, message)

        // Implement simple log rotation (max 10MB per file)
        const stats = fs.statSync(this.logFile)
        if (stats.size > 10 * 1024 * 1024) {
          this.rotateLog()
        }
      } catch (error) {
        // Silently fail - we don't want logging to break the app
      }
    }
  }

  private rotateLog(): void {
    if (!this.logFile) return

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = this.logFile.replace('.log', `-${timestamp}.log`)
      fs.renameSync(this.logFile, rotatedFile)

      // Clean up old logs (keep last 5)
      const logsDir = path.dirname(this.logFile)
      const logs = fs
        .readdirSync(logsDir)
        .filter((f) => f.startsWith('claude-composer-') && f.endsWith('.log'))
        .sort()
        .reverse()

      logs.slice(5).forEach((oldLog) => {
        try {
          fs.unlinkSync(path.join(logsDir, oldLog))
        } catch (e) {}
      })
    } catch (error) {
      // Rotation failed, but continue
    }
  }

  error(message: string, error?: Error): void {
    if (this.logLevel >= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message, error)
      if (this.debugMode || process.env.DEBUG) {
        console.error(`\x1b[31m[ERROR] ${message}\x1b[0m`, error || '')
      }
      this.writeToFile(formatted)
    }
  }

  warn(message: string): void {
    if (this.logLevel >= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message)
      if (this.debugMode || process.env.DEBUG) {
        console.warn(`\x1b[33m[WARN] ${message}\x1b[0m`)
      }
      this.writeToFile(formatted)
    }
  }

  info(message: string): void {
    if (this.logLevel >= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message)
      if (this.debugMode || process.env.DEBUG) {
        console.info(`\x1b[36m[INFO] ${message}\x1b[0m`)
      }
      this.writeToFile(formatted)
    }
  }

  debug(message: string): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message)
      if (this.debugMode || process.env.DEBUG) {
        console.debug(`\x1b[90m[DEBUG] ${message}\x1b[0m`)
      }
      this.writeToFile(formatted)
    }
  }
}

export const errorLogger = ErrorLogger.getInstance()
