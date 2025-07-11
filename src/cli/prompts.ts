import * as fs from 'fs'
import prompts from 'prompts'

export async function askYesNo(
  question: string,
  defaultNo: boolean = true,
  stdin?: NodeJS.ReadableStream,
  stdout?: NodeJS.WritableStream,
): Promise<boolean> {
  let tty: fs.ReadStream | undefined
  let ttyOutput: fs.WriteStream | undefined
  let result: boolean

  try {
    // Configure prompts to use custom streams if provided
    if (stdin || stdout) {
      prompts.override({
        stdin: stdin || process.stdin,
        stdout: stdout || process.stdout,
      })
    }

    // Handle non-TTY environments
    if (!process.stdin.isTTY && !stdin?.isTTY) {
      try {
        // Try to use /dev/tty for non-TTY environments
        if (fs.existsSync('/dev/tty')) {
          tty = fs.createReadStream('/dev/tty', { flags: 'r' })
          ttyOutput = fs.createWriteStream('/dev/tty', { flags: 'w' })

          // Wait for TTY to be ready
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('TTY timeout'))
            }, 1000)

            tty!.once('error', (err) => {
              clearTimeout(timeout)
              reject(err)
            })

            tty!.once('open', () => {
              clearTimeout(timeout)
              resolve()
            })
          })

          prompts.override({
            stdin: tty as any,
            stdout: ttyOutput as any,
          })
        } else {
          // No TTY available, return default
          return !defaultNo
        }
      } catch (error) {
        // Failed to open TTY, return default
        return !defaultNo
      }
    }

    // Create the prompt
    const response = await prompts(
      {
        type: 'confirm',
        name: 'value',
        message: question,
        initial: !defaultNo,
      },
      {
        onCancel: () => {
          process.exit(130)
        },
      },
    )

    // Return the response or default if cancelled/empty
    result = response.value !== undefined ? response.value : !defaultNo
  } finally {
    // Always clean up
    prompts.override({})

    // Clean up TTY streams if they were created
    if (tty) {
      tty.destroy()
    }
    if (ttyOutput) {
      ttyOutput.destroy()
    }

    // Ensure stdin is resumed and in the correct mode
    if (process.stdin.isTTY) {
      // Reset raw mode if it was set
      if ('setRawMode' in process.stdin && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false)
      }
      // Ensure stdin is resumed
      if (process.stdin.isPaused()) {
        process.stdin.resume()
      }
    }
  }

  return result
}

export async function askProviderSelection(
  currentProvider: 'claude-code' | 'gemini',
  availableProviders: Array<'claude-code' | 'gemini'>,
  stdin?: NodeJS.ReadableStream,
  stdout?: NodeJS.WritableStream,
): Promise<'claude-code' | 'gemini' | null> {
  let tty: fs.ReadStream | undefined
  let ttyOutput: fs.WriteStream | undefined
  let result: 'claude-code' | 'gemini' | null = null

  try {
    // Configure prompts to use custom streams if provided
    if (stdin || stdout) {
      prompts.override({
        stdin: stdin || process.stdin,
        stdout: stdout || process.stdout,
      })
    }

    // Handle non-TTY environments
    if (!process.stdin.isTTY && !stdin?.isTTY) {
      try {
        // Try to use /dev/tty for non-TTY environments
        if (fs.existsSync('/dev/tty')) {
          tty = fs.createReadStream('/dev/tty', { flags: 'r' })
          ttyOutput = fs.createWriteStream('/dev/tty', { flags: 'w' })

          // Wait for TTY to be ready
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('TTY timeout'))
            }, 1000)

            tty!.once('error', (err) => {
              clearTimeout(timeout)
              reject(err)
            })

            tty!.once('open', () => {
              clearTimeout(timeout)
              resolve()
            })
          })

          prompts.override({
            stdin: tty as any,
            stdout: ttyOutput as any,
          })
        } else {
          // No TTY available, return current provider
          return currentProvider
        }
      } catch (error) {
        // Failed to open TTY, return current provider
        return currentProvider
      }
    }

    // Build choices
    const choices = []

    if (availableProviders.includes('claude-code')) {
      choices.push({
        title: currentProvider === 'claude-code' ? 'Claude Code (current)' : 'Claude Code',
        value: 'claude-code',
        description: 'Use Claude Code AI assistant',
      })
    }

    if (availableProviders.includes('gemini')) {
      choices.push({
        title: currentProvider === 'gemini' ? 'Gemini (current)' : 'Gemini',
        value: 'gemini',
        description: 'Use Gemini AI assistant',
      })
    }

    // If no providers available, show both options anyway
    if (choices.length === 0) {
      choices.push(
        {
          title: currentProvider === 'claude-code' ? 'Claude Code (current)' : 'Claude Code',
          value: 'claude-code',
          description: 'Use Claude Code AI assistant',
        },
        {
          title: currentProvider === 'gemini' ? 'Gemini (current)' : 'Gemini',
          value: 'gemini',
          description: 'Use Gemini AI assistant',
        },
      )
    }

    // Create the prompt
    const response = await prompts(
      {
        type: 'select',
        name: 'provider',
        message: '※ Select AI provider',
        choices: choices,
        initial: choices.findIndex((c) => c.value === currentProvider) || 0,
      },
      {
        onCancel: () => {
          result = null
          return false
        },
      },
    )

    // Return the response
    result = response.provider || null
  } finally {
    // Always clean up
    prompts.override({})

    // Clean up TTY streams if they were created
    if (tty) {
      tty.destroy()
    }
    if (ttyOutput) {
      ttyOutput.destroy()
    }

    // Ensure stdin is resumed and in the correct mode
    if (process.stdin.isTTY) {
      // Reset raw mode if it was set
      if ('setRawMode' in process.stdin && typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false)
      }
      // Ensure stdin is resumed
      if (process.stdin.isPaused()) {
        process.stdin.resume()
      }
    }
  }

  return result
}
