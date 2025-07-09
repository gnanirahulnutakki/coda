/**
 * Central error handling utilities and custom error classes
 */

/**
 * Base error class for all Claude Composer errors
 */
export abstract class ClaudeComposerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    }
  }
}

/**
 * Error thrown when terminal operations fail
 */
export class TerminalError extends ClaudeComposerError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TERMINAL_ERROR', details)
  }
}

/**
 * Error thrown when pattern matching fails
 */
export class PatternMatchError extends ClaudeComposerError {
  constructor(message: string, patternId?: string, details?: Record<string, any>) {
    super(message, 'PATTERN_MATCH_ERROR', { patternId, ...details })
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileOperationError extends ClaudeComposerError {
  constructor(operation: string, filePath: string, originalError?: Error) {
    super(
      `Failed to ${operation} file: ${filePath}`,
      'FILE_OPERATION_ERROR',
      { operation, filePath, originalError: originalError?.message }
    )
  }
}

/**
 * Error thrown when child process operations fail
 */
export class ChildProcessError extends ClaudeComposerError {
  constructor(message: string, exitCode?: number, details?: Record<string, any>) {
    super(message, 'CHILD_PROCESS_ERROR', { exitCode, ...details })
  }
}

/**
 * Error thrown when safety checks fail
 */
export class SafetyCheckError extends ClaudeComposerError {
  constructor(message: string, checkType: string) {
    super(message, 'SAFETY_CHECK_ERROR', { checkType })
  }
}

/**
 * Error thrown when CLI arguments are invalid
 */
export class CLIArgumentError extends ClaudeComposerError {
  constructor(message: string, argument?: string) {
    super(message, 'CLI_ARGUMENT_ERROR', { argument })
  }
}

/**
 * User-friendly error handler
 */
export function handleError(error: Error): void {
  if (error instanceof ClaudeComposerError) {
    console.error(`\x1b[31m✗ ${error.message}\x1b[0m`)
    
    if (process.env.DEBUG || process.argv.includes('--debug')) {
      console.error('\nError details:', error.details)
      console.error('\nStack trace:', error.stack)
    }
    
    process.exit(1)
  } else {
    // Unknown error
    console.error(`\x1b[31m✗ An unexpected error occurred: ${error.message}\x1b[0m`)
    
    if (process.env.DEBUG || process.argv.includes('--debug')) {
      console.error('\nStack trace:', error.stack)
    }
    
    process.exit(1)
  }
}

/**
 * Wraps an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      handleError(error as Error)
    }
  }) as T
}