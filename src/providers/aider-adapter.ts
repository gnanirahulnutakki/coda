import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { getProviderCommand } from '../config/ai-providers.js'

export interface AiderOptions {
  model?: string
  editFormat?: string
  noAutoCommits?: boolean
  yesAlways?: boolean
  voice?: boolean
  files?: string[]
  message?: string
  cwd?: string
  env?: Record<string, string>
}

export class AiderAdapter {
  private process: ChildProcess | null = null
  private command: string
  
  constructor() {
    const cmd = getProviderCommand('aider')
    if (!cmd) {
      throw new Error('Aider not found. Install with: pip install aider-install')
    }
    this.command = cmd
  }
  
  /**
   * Start an Aider session
   */
  async start(options: AiderOptions = {}): Promise<ChildProcess> {
    const args: string[] = []
    
    // Model selection
    if (options.model) {
      args.push('--model', options.model)
    }
    
    // Edit format (for better compatibility)
    if (options.editFormat) {
      args.push('--edit-format', options.editFormat)
    }
    
    // Auto commits
    if (options.noAutoCommits) {
      args.push('--no-auto-commits')
    }
    
    // Yes to all prompts (similar to YOLO mode)
    if (options.yesAlways) {
      args.push('--yes-always')
    }
    
    // Voice input
    if (options.voice) {
      args.push('--voice')
    }
    
    // Add files to context
    if (options.files && options.files.length > 0) {
      args.push(...options.files)
    }
    
    // Initial message
    if (options.message) {
      args.push('--message', options.message)
    }
    
    // Spawn Aider process
    this.process = spawn(this.command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...options.env
      },
      stdio: 'inherit', // Direct I/O for interactive session
      shell: true
    })
    
    // Handle process events
    this.process.on('error', (error) => {
      console.error('Aider process error:', error)
    })
    
    this.process.on('exit', (code, signal) => {
      if (code !== 0) {
        console.log(`Aider exited with code ${code} (signal: ${signal})`)
      }
    })
    
    return this.process
  }
  
  /**
   * Send a message to Aider (for non-interactive use)
   */
  async sendMessage(message: string, options: AiderOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['--message', message, '--no-pretty']
      
      if (options.model) args.push('--model', options.model)
      if (options.files) args.push(...options.files)
      if (options.yesAlways) args.push('--yes-always')
      if (options.noAutoCommits) args.push('--no-auto-commits')
      
      let output = ''
      let errorOutput = ''
      
      const proc = spawn(this.command, args, {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...options.env
        }
      })
      
      proc.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      proc.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output)
        } else {
          reject(new Error(`Aider failed with code ${code}: ${errorOutput}`))
        }
      })
    })
  }
  
  /**
   * Check if Aider is available
   */
  static isAvailable(): boolean {
    return getProviderCommand('aider') !== null
  }
  
  /**
   * Get Aider version
   */
  async getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.command, ['--version'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      let output = ''
      proc.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim())
        } else {
          reject(new Error('Failed to get Aider version'))
        }
      })
    })
  }
  
  /**
   * Apply Coda configuration to Aider options
   */
  static applyCodeConfig(codaConfig: any): AiderOptions {
    const aiderOptions: AiderOptions = {}
    
    // Map YOLO mode to yes-always
    if (codaConfig.yolo) {
      aiderOptions.yesAlways = true
    }
    
    // Map quiet mode
    if (!codaConfig.quiet) {
      // Aider is verbose by default, no flag needed
    }
    
    // Auto-commits based on git settings
    if (codaConfig.dangerously_allow_without_version_control) {
      aiderOptions.noAutoCommits = true
    }
    
    return aiderOptions
  }
}