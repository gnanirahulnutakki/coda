import * as pty from '@homebridge/node-pty-prebuilt-multiarch'
import { spawn, ChildProcess } from 'child_process'
import { PassThrough } from 'stream'
import * as fs from 'fs'
import type { Terminal } from '@xterm/xterm'
import type { SerializeAddon } from '@xterm/addon-serialize'
import type {
  TerminalConfig,
  TerminalState,
  DataHandler,
  ExitHandler,
  ResizeHandler,
} from './types'
import { saveTerminalSnapshot } from './utils'
import type { AppConfig } from '../config/schemas'
import type { ResponseQueue } from '../core/response-queue'
import { errorLogger } from '../utils/error-logger'

export class TerminalManager {
  private state: TerminalState = {
    isStdinPaused: false,
    isRawMode: false,
    pendingPromptCheck: null,
  }

  private dataHandlers: DataHandler[] = []
  private exitHandlers: ExitHandler[] = []
  private resizeHandlers: ResizeHandler[] = []
  private tempMcpConfigPath?: string
  private appConfig?: AppConfig
  private responseQueue?: ResponseQueue
  private eventListeners: { target: any; event: string; handler: any }[] = []

  constructor(appConfig?: AppConfig, responseQueue?: ResponseQueue) {
    this.appConfig = appConfig
    this.responseQueue = responseQueue
  }

  async initialize(config: TerminalConfig): Promise<void> {
    const { isTTY, cols, rows, env, cwd, childAppPath, childArgs } = config

    if (isTTY) {
      await this.initializePty(childAppPath, childArgs, cols, rows, env, cwd)
    } else {
      await this.initializeChildProcess(childAppPath, childArgs, env)
    }
  }

  private async initializePty(
    childAppPath: string,
    childArgs: string[],
    cols: number,
    rows: number,
    env: NodeJS.ProcessEnv,
    cwd: string,
  ): Promise<void> {
    try {
      this.state.ptyProcess = pty.spawn(childAppPath, childArgs, {
        name: 'xterm-color',
        cols,
        rows,
        env,
        cwd,
      })
    } catch (error) {
      console.error('\x1b[31m╔══════════════════════════════════════════════════════╗\x1b[0m')
      console.error('\x1b[31m║          Failed to Start AI Provider                 ║\x1b[0m')
      console.error('\x1b[31m╠══════════════════════════════════════════════════════╣\x1b[0m')
      console.error(`\x1b[31m║ Command: ${childAppPath}\x1b[0m`)
      console.error(`\x1b[31m║ Error: ${error.message || error}\x1b[0m`)
      console.error('\x1b[31m╠══════════════════════════════════════════════════════╣\x1b[0m')
      console.error('\x1b[31m║ Possible solutions:                                  ║\x1b[0m')
      console.error('\x1b[31m║ 1. Make sure the AI provider is installed           ║\x1b[0m')
      console.error('\x1b[31m║ 2. Check if the path is correct                     ║\x1b[0m')
      console.error('\x1b[31m║ 3. Try running the provider directly to test        ║\x1b[0m')
      console.error('\x1b[31m╚══════════════════════════════════════════════════════╝\x1b[0m')
      process.exit(1)
    }

    if (this.responseQueue) {
      this.responseQueue.setTargets(this.state.ptyProcess, undefined)
    }

    if (this.appConfig && this.shouldInitializeXterm()) {
      await this.initializeXterm(cols, rows)
    }

    // Buffer to collect early error messages
    let earlyErrorBuffer = ''
    let earlyErrorTimeout: NodeJS.Timeout | null = null

    const dataHandler = (data: string) => {
      // Collect early data to check for errors
      if (earlyErrorTimeout) {
        earlyErrorBuffer += data

        // Check for known error patterns
        if (
          earlyErrorBuffer.includes('Error: Unable to find helper app') ||
          earlyErrorBuffer.includes(
            "Could not automatically determine the current application's identifier",
          ) ||
          earlyErrorBuffer.includes('Squirrel.Windows') ||
          earlyErrorBuffer.includes('ENOENT')
        ) {
          clearTimeout(earlyErrorTimeout)
          earlyErrorTimeout = null

          console.error('\x1b[31m╔══════════════════════════════════════════════════════╗\x1b[0m')
          console.error('\x1b[31m║         AI Provider Startup Error                    ║\x1b[0m')
          console.error('\x1b[31m╠══════════════════════════════════════════════════════╣\x1b[0m')
          console.error('\x1b[31m║ The AI provider encountered startup errors.          ║\x1b[0m')
          console.error('\x1b[31m║                                                      ║\x1b[0m')

          if (earlyErrorBuffer.includes('Squirrel.Windows')) {
            console.error('\x1b[31m║ This appears to be an Electron/Squirrel issue.      ║\x1b[0m')
            console.error('\x1b[31m║ The app may need to be properly installed first.    ║\x1b[0m')
          }

          console.error('\x1b[31m║                                                      ║\x1b[0m')
          console.error('\x1b[31m║ Try running the provider directly:                  ║\x1b[0m')
          console.error(`\x1b[31m║   ${childAppPath}\x1b[0m`)
          console.error('\x1b[31m╚══════════════════════════════════════════════════════╝\x1b[0m')
          console.error('\n\x1b[33mFull error output:\x1b[0m')
          console.error(earlyErrorBuffer)
        }
      }

      this.dataHandlers.forEach((handler) => handler(data))
    }

    // Set up early error detection timeout
    earlyErrorTimeout = setTimeout(() => {
      earlyErrorTimeout = null
      earlyErrorBuffer = ''
    }, 3000) // Clear buffer after 3 seconds if no errors detected

    const exitHandler = (exitCode: { exitCode: number }) => {
      if (earlyErrorTimeout) {
        clearTimeout(earlyErrorTimeout)
        earlyErrorTimeout = null
      }
      this.exitHandlers.forEach((handler) => handler(exitCode.exitCode || 0))
    }

    this.state.ptyProcess.onData(dataHandler)
    this.state.ptyProcess.onExit(exitHandler)

    // Track event listeners for cleanup
    this.eventListeners.push(
      { target: this.state.ptyProcess, event: 'data', handler: dataHandler },
      { target: this.state.ptyProcess, event: 'exit', handler: exitHandler },
    )

    if (process.stdin.isTTY) {
      process.stdin.removeAllListeners('data')
      process.stdin.setRawMode(true)
      this.state.isRawMode = true
    }
  }

  private async initializeChildProcess(
    childAppPath: string,
    childArgs: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    if (!process.stdin.isTTY) {
      this.state.stdinBuffer = new PassThrough()
      process.stdin.pipe(this.state.stdinBuffer)
      process.stdin.pause()
      this.state.isStdinPaused = true
    }

    this.state.childProcess = spawn(childAppPath, childArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...env,
        FORCE_COLOR: '1',
        TERM: env.TERM || 'xterm-256color',
      },
    })

    if (this.responseQueue) {
      this.responseQueue.setTargets(undefined, this.state.childProcess)
    }

    if (this.appConfig && this.shouldInitializeXterm()) {
      await this.initializeXterm(80, 30)
    }
    if (this.state.stdinBuffer) {
      if (this.state.isStdinPaused) {
        process.stdin.resume()
        this.state.isStdinPaused = false
      }
      this.state.stdinBuffer.pipe(this.state.childProcess.stdin!)
    } else {
      process.stdin.pipe(this.state.childProcess.stdin!)
    }

    const stdoutHandler = (data: Buffer) => {
      const dataStr = data.toString()
      this.dataHandlers.forEach((handler) => handler(dataStr))
    }
    const exitHandler = (code: number | null) => {
      this.exitHandlers.forEach((handler) => handler(code || 0))
    }

    this.state.childProcess.stdout!.on('data', stdoutHandler)
    this.state.childProcess.stderr!.pipe(process.stderr)
    this.state.childProcess.on('exit', exitHandler)

    // Track event listeners for cleanup
    this.eventListeners.push(
      { target: this.state.childProcess.stdout, event: 'data', handler: stdoutHandler },
      { target: this.state.childProcess, event: 'exit', handler: exitHandler },
    )
  }

  private async initializeXterm(cols: number, rows: number): Promise<void> {
    try {
      const xtermModule = await import('@xterm/xterm')
      const Terminal = xtermModule.Terminal || xtermModule.default?.Terminal || xtermModule.default
      const addonModule = await import('@xterm/addon-serialize')
      const SerializeAddon =
        addonModule.SerializeAddon || addonModule.default?.SerializeAddon || addonModule.default

      this.state.terminal = new Terminal({
        cols,
        rows,
        scrollback: 5000,
      }) as Terminal

      this.state.serializeAddon = new SerializeAddon() as SerializeAddon
      this.state.terminal.loadAddon(this.state.serializeAddon)
    } catch (error) {
      errorLogger.debug('Failed to initialize xterm - this is expected in some environments')
    }
  }

  private shouldInitializeXterm(): boolean {
    return true
  }

  handleStdinData(data: Buffer): void {
    try {
      if (this.appConfig?.allow_buffer_snapshots && data.length === 1 && data[0] === 19) {
        saveTerminalSnapshot(this.state.terminal, this.state.serializeAddon, this.appConfig)
        return
      }

      if (this.state.ptyProcess) {
        this.state.ptyProcess.write(data.toString())
      }
    } catch (error) {
      errorLogger.warn('Failed to handle stdin data', error as Error)
    }
  }

  onData(handler: DataHandler): void {
    this.dataHandlers.push(handler)
  }

  onExit(handler: ExitHandler): void {
    this.exitHandlers.push(handler)
  }

  onResize(handler: ResizeHandler): void {
    this.resizeHandlers.push(handler)
  }

  write(data: string | Buffer): void {
    if (this.state.ptyProcess) {
      this.state.ptyProcess.write(data.toString())
    } else if (this.state.childProcess?.stdin) {
      this.state.childProcess.stdin.write(data)
    }
  }

  resize(cols: number, rows: number): void {
    try {
      if (this.state.ptyProcess) {
        this.state.ptyProcess.resize(cols, rows)
      }
      if (this.state.terminal) {
        this.state.terminal.resize(cols, rows)
      }
      this.resizeHandlers.forEach((handler) => handler(cols, rows))
    } catch (error) {
      errorLogger.debug('Failed to resize terminal', error as Error)
    }
  }

  async captureSnapshot(): Promise<string | null> {
    if (!this.state.terminal || !this.state.serializeAddon) {
      return null
    }

    try {
      return this.state.serializeAddon.serialize()
    } catch (error) {
      return null
    }
  }

  updateTerminalBuffer(data: string): void {
    if (this.state.terminal) {
      this.state.terminal.write(data)
    }
  }

  cleanup(): void {
    // Remove all event listeners
    this.eventListeners.forEach(({ target, event, handler }) => {
      if (target && typeof target.removeListener === 'function') {
        target.removeListener(event, handler)
      } else if (target && typeof target.off === 'function') {
        target.off(event, handler)
      }
    })
    this.eventListeners = []

    // Clear handler arrays
    this.dataHandlers = []
    this.exitHandlers = []
    this.resizeHandlers = []

    if (this.state.isRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false)
      this.state.isRawMode = false
    }

    if (this.state.pendingPromptCheck) {
      clearTimeout(this.state.pendingPromptCheck)
      this.state.pendingPromptCheck = null
    }

    if (this.state.terminal) {
      this.state.terminal.dispose()
      this.state.terminal = undefined
    }

    if (this.state.ptyProcess) {
      try {
        this.state.ptyProcess.kill()
      } catch (e) {
        errorLogger.debug('Failed to kill pty process - may have already exited')
      }
    }

    if (this.state.childProcess) {
      try {
        this.state.childProcess.kill()
      } catch (e) {
        errorLogger.debug('Failed to kill child process - may have already exited')
      }
    }

    if (this.tempMcpConfigPath && fs.existsSync(this.tempMcpConfigPath)) {
      try {
        fs.unlinkSync(this.tempMcpConfigPath)
      } catch (e) {
        errorLogger.debug('Failed to unlink temp MCP config file')
      }
    }

    if (this.state.stdinBuffer) {
      this.state.stdinBuffer.destroy()
      this.state.stdinBuffer = undefined
    }
  }

  setTempMcpConfigPath(path: string): void {
    this.tempMcpConfigPath = path
  }

  getTerminalState(): TerminalState {
    return { ...this.state }
  }

  setPendingPromptCheck(timeout: NodeJS.Timeout | null): void {
    if (this.state.pendingPromptCheck) {
      clearTimeout(this.state.pendingPromptCheck)
    }
    this.state.pendingPromptCheck = timeout
  }
}
