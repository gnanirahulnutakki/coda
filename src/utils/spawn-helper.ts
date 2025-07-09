import { spawn, SpawnOptions } from 'child_process'
import * as path from 'path'

/**
 * Cross-platform spawn helper that handles Windows-specific issues
 */
export function spawnCrossplatform(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {},
): ReturnType<typeof spawn> {
  if (process.platform === 'win32') {
    // On Windows, we need to handle a few special cases:

    // 1. Node.js scripts might need to be run with node
    if (command.endsWith('.js')) {
      return spawn('node', [command, ...args], options)
    }

    // 2. Python scripts might need to be run with python
    if (command.endsWith('.py')) {
      return spawn('python', [command, ...args], options)
    }

    // 3. Handle .exe extension
    if (!command.endsWith('.exe') && !command.includes('.')) {
      // Try with .exe extension first
      try {
        return spawn(command + '.exe', args, options)
      } catch {
        // Fall back to original
      }
    }

    // 4. Use shell for complex commands (like 'gh copilot')
    if (command.includes(' ')) {
      const [cmd, ...cmdArgs] = command.split(' ')
      return spawn(cmd, [...cmdArgs, ...args], {
        ...options,
        shell: true,
      })
    }
  }

  // Default spawn
  return spawn(command, args, options)
}

/**
 * Get the appropriate shell for the platform
 */
export function getShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/sh'
}

/**
 * Execute a command in a cross-platform way
 */
export function execCrossplatform(command: string, options: SpawnOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = getShell()
    const isWindows = process.platform === 'win32'

    const proc = spawn(shell, isWindows ? ['/c', command] : ['-c', command], {
      ...options,
      shell: false, // We're already using shell explicitly
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}
