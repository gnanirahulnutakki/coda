import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { CONFIG_PATHS } from '../config/paths.js'

export interface FileDiff {
  file: string
  type: 'create' | 'modify' | 'delete'
  oldContent?: string
  newContent?: string
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffPreviewOptions {
  contextLines?: number
  colorize?: boolean
  unifiedFormat?: boolean
  sideBySide?: boolean
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
}

export class DiffPreviewer {
  private pendingChanges: Map<string, FileDiff> = new Map()
  private snapshotDir: string

  constructor() {
    this.snapshotDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'diff-snapshots')
    this.ensureSnapshotDirectory()
  }

  private ensureSnapshotDirectory(): void {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true })
    }
  }

  /**
   * Add a file change to preview
   */
  addFileChange(filePath: string, newContent: string, type: 'create' | 'modify' = 'modify'): void {
    const absolutePath = path.resolve(filePath)
    let oldContent = ''

    if (type === 'modify' && fs.existsSync(absolutePath)) {
      oldContent = fs.readFileSync(absolutePath, 'utf8')
    }

    const diff = this.generateDiff(oldContent, newContent, absolutePath, type)
    this.pendingChanges.set(absolutePath, diff)
  }

  /**
   * Add a file deletion to preview
   */
  addFileDeletion(filePath: string): void {
    const absolutePath = path.resolve(filePath)

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File ${filePath} does not exist`)
    }

    const oldContent = fs.readFileSync(absolutePath, 'utf8')
    const diff = this.generateDiff(oldContent, '', absolutePath, 'delete')
    this.pendingChanges.set(absolutePath, diff)
  }

  /**
   * Generate diff between old and new content
   */
  private generateDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
    type: 'create' | 'modify' | 'delete',
  ): FileDiff {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    const hunks = this.computeDiffHunks(oldLines, newLines)

    let additions = 0
    let deletions = 0

    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') additions++
        if (line.type === 'delete') deletions++
      }
    }

    return {
      file: filePath,
      type,
      oldContent,
      newContent,
      additions,
      deletions,
      hunks,
    }
  }

  /**
   * Compute diff hunks using a simple algorithm
   */
  private computeDiffHunks(
    oldLines: string[],
    newLines: string[],
    contextLines: number = 3,
  ): DiffHunk[] {
    const hunks: DiffHunk[] = []

    // Simple line-by-line comparison (in production, use a proper diff algorithm)
    const maxLines = Math.max(oldLines.length, newLines.length)
    let currentHunk: DiffHunk | null = null
    let oldLineNum = 1
    let newLineNum = 1

    for (let i = 0; i < maxLines; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined
      const newLine = i < newLines.length ? newLines[i] : undefined

      if (oldLine === newLine) {
        // Context line
        if (currentHunk) {
          currentHunk.lines.push({
            type: 'context',
            content: oldLine || '',
            oldLineNumber: oldLineNum,
            newLineNumber: newLineNum,
          })
        }
        if (oldLine !== undefined) oldLineNum++
        if (newLine !== undefined) newLineNum++
      } else {
        // Start new hunk if needed
        if (!currentHunk) {
          currentHunk = {
            oldStart: Math.max(1, oldLineNum - contextLines),
            oldLines: 0,
            newStart: Math.max(1, newLineNum - contextLines),
            newLines: 0,
            lines: [],
          }

          // Add context before
          for (let j = Math.max(0, i - contextLines); j < i; j++) {
            if (j < oldLines.length && j < newLines.length && oldLines[j] === newLines[j]) {
              currentHunk.lines.push({
                type: 'context',
                content: oldLines[j],
                oldLineNumber: currentHunk.oldStart + currentHunk.lines.length,
                newLineNumber: currentHunk.newStart + currentHunk.lines.length,
              })
            }
          }

          hunks.push(currentHunk)
        }

        // Add changed lines
        if (oldLine !== undefined && newLine === undefined) {
          // Deletion
          currentHunk.lines.push({
            type: 'delete',
            content: oldLine,
            oldLineNumber: oldLineNum,
          })
          oldLineNum++
        } else if (oldLine === undefined && newLine !== undefined) {
          // Addition
          currentHunk.lines.push({
            type: 'add',
            content: newLine,
            newLineNumber: newLineNum,
          })
          newLineNum++
        } else if (oldLine !== undefined && newLine !== undefined) {
          // Modification (show as delete + add)
          currentHunk.lines.push({
            type: 'delete',
            content: oldLine,
            oldLineNumber: oldLineNum,
          })
          currentHunk.lines.push({
            type: 'add',
            content: newLine,
            newLineNumber: newLineNum,
          })
          oldLineNum++
          newLineNum++
        }
      }

      // End hunk if we have enough context
      if (currentHunk && i < maxLines - 1) {
        let contextCount = 0
        for (let j = currentHunk.lines.length - 1; j >= 0; j--) {
          if (currentHunk.lines[j].type === 'context') {
            contextCount++
          } else {
            break
          }
        }

        if (contextCount >= contextLines * 2) {
          // Update line counts
          currentHunk.oldLines = currentHunk.lines.filter(
            (l) => l.oldLineNumber !== undefined,
          ).length
          currentHunk.newLines = currentHunk.lines.filter(
            (l) => l.newLineNumber !== undefined,
          ).length
          currentHunk = null
        }
      }
    }

    // Finalize last hunk
    if (currentHunk) {
      currentHunk.oldLines = currentHunk.lines.filter((l) => l.oldLineNumber !== undefined).length
      currentHunk.newLines = currentHunk.lines.filter((l) => l.newLineNumber !== undefined).length
    }

    return hunks
  }

  /**
   * Get preview of all pending changes
   */
  getPreview(options: DiffPreviewOptions = {}): string {
    const { colorize = true, unifiedFormat = true, sideBySide = false } = options

    if (this.pendingChanges.size === 0) {
      return 'No pending changes to preview'
    }

    const previews: string[] = []

    for (const [filePath, diff] of this.pendingChanges) {
      if (sideBySide) {
        previews.push(this.formatSideBySideDiff(diff, colorize))
      } else if (unifiedFormat) {
        previews.push(this.formatUnifiedDiff(diff, colorize))
      } else {
        previews.push(this.formatSimpleDiff(diff, colorize))
      }
    }

    return previews.join('\n\n')
  }

  /**
   * Format diff in unified format (like git diff)
   */
  private formatUnifiedDiff(diff: FileDiff, colorize: boolean): string {
    const lines: string[] = []
    const colors = {
      header: colorize ? '\x1b[36m' : '',
      add: colorize ? '\x1b[32m' : '',
      delete: colorize ? '\x1b[31m' : '',
      hunk: colorize ? '\x1b[35m' : '',
      reset: colorize ? '\x1b[0m' : '',
    }

    // File header
    const relativePath = path.relative(process.cwd(), diff.file)
    if (diff.type === 'create') {
      lines.push(`${colors.header}+++ ${relativePath} (new file)${colors.reset}`)
    } else if (diff.type === 'delete') {
      lines.push(`${colors.header}--- ${relativePath} (deleted)${colors.reset}`)
    } else {
      lines.push(`${colors.header}--- ${relativePath}${colors.reset}`)
      lines.push(`${colors.header}+++ ${relativePath}${colors.reset}`)
    }

    // Hunks
    for (const hunk of diff.hunks) {
      lines.push(
        `${colors.hunk}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${colors.reset}`,
      )

      for (const line of hunk.lines) {
        switch (line.type) {
          case 'add':
            lines.push(`${colors.add}+${line.content}${colors.reset}`)
            break
          case 'delete':
            lines.push(`${colors.delete}-${line.content}${colors.reset}`)
            break
          case 'context':
            lines.push(` ${line.content}`)
            break
        }
      }
    }

    // Summary
    lines.push('')
    lines.push(
      `${colors.header}Changes: ${colors.add}+${diff.additions}${colors.reset}, ${colors.delete}-${diff.deletions}${colors.reset}`,
    )

    return lines.join('\n')
  }

  /**
   * Format diff in side-by-side format
   */
  private formatSideBySideDiff(diff: FileDiff, colorize: boolean): string {
    const lines: string[] = []
    const colors = {
      header: colorize ? '\x1b[36m' : '',
      add: colorize ? '\x1b[32m' : '',
      delete: colorize ? '\x1b[31m' : '',
      reset: colorize ? '\x1b[0m' : '',
    }

    const relativePath = path.relative(process.cwd(), diff.file)
    lines.push(`${colors.header}File: ${relativePath}${colors.reset}`)
    lines.push('─'.repeat(80))

    const columnWidth = 35
    lines.push(`${'OLD'.padEnd(columnWidth)} │ ${'NEW'.padEnd(columnWidth)}`)
    lines.push('─'.repeat(80))

    for (const hunk of diff.hunks) {
      let oldIndex = 0
      let newIndex = 0

      while (oldIndex < hunk.lines.length || newIndex < hunk.lines.length) {
        const oldLine = hunk.lines[oldIndex]
        const newLine = hunk.lines[newIndex]

        if (oldLine?.type === 'delete') {
          const content = this.truncate(oldLine.content, columnWidth - 2)
          lines.push(
            `${colors.delete}${content.padEnd(columnWidth)}${colors.reset} │ ${''.padEnd(columnWidth)}`,
          )
          oldIndex++
        } else if (newLine?.type === 'add') {
          const content = this.truncate(newLine.content, columnWidth - 2)
          lines.push(
            `${''.padEnd(columnWidth)} │ ${colors.add}${content.padEnd(columnWidth)}${colors.reset}`,
          )
          newIndex++
        } else if (oldLine?.type === 'context' && newLine?.type === 'context') {
          const content = this.truncate(oldLine.content, columnWidth - 2)
          lines.push(`${content.padEnd(columnWidth)} │ ${content.padEnd(columnWidth)}`)
          oldIndex++
          newIndex++
        } else {
          oldIndex++
          newIndex++
        }
      }
    }

    return lines.join('\n')
  }

  /**
   * Format diff in simple format
   */
  private formatSimpleDiff(diff: FileDiff, colorize: boolean): string {
    const lines: string[] = []
    const colors = {
      header: colorize ? '\x1b[36m' : '',
      add: colorize ? '\x1b[32m' : '',
      delete: colorize ? '\x1b[31m' : '',
      reset: colorize ? '\x1b[0m' : '',
    }

    const relativePath = path.relative(process.cwd(), diff.file)
    lines.push(`${colors.header}File: ${relativePath}${colors.reset}`)

    if (diff.type === 'create') {
      lines.push(`${colors.add}[NEW FILE]${colors.reset}`)
    } else if (diff.type === 'delete') {
      lines.push(`${colors.delete}[DELETED]${colors.reset}`)
    } else {
      lines.push(`[MODIFIED]`)
    }

    lines.push(
      `Changes: ${colors.add}+${diff.additions}${colors.reset}, ${colors.delete}-${diff.deletions}${colors.reset}`,
    )

    return lines.join('\n')
  }

  /**
   * Truncate string to fit in column
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str
    return str.substring(0, maxLength - 3) + '...'
  }

  /**
   * Apply all pending changes
   */
  async applyChanges(): Promise<ApplyResult> {
    const results: ApplyResult = {
      succeeded: [],
      failed: [],
      totalChanges: this.pendingChanges.size,
    }

    for (const [filePath, diff] of this.pendingChanges) {
      try {
        switch (diff.type) {
          case 'create':
            const dir = path.dirname(filePath)
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true })
            }
            fs.writeFileSync(filePath, diff.newContent || '')
            results.succeeded.push(filePath)
            break

          case 'modify':
            fs.writeFileSync(filePath, diff.newContent || '')
            results.succeeded.push(filePath)
            break

          case 'delete':
            fs.unlinkSync(filePath)
            results.succeeded.push(filePath)
            break
        }
      } catch (error) {
        results.failed.push({
          file: filePath,
          error: error.message,
        })
      }
    }

    // Clear pending changes after applying
    this.pendingChanges.clear()

    return results
  }

  /**
   * Discard all pending changes
   */
  discardChanges(): void {
    this.pendingChanges.clear()
  }

  /**
   * Get list of files with pending changes
   */
  getPendingFiles(): string[] {
    return Array.from(this.pendingChanges.keys())
  }

  /**
   * Save current preview to file
   */
  savePreview(outputPath: string, options: DiffPreviewOptions = {}): void {
    const preview = this.getPreview({ ...options, colorize: false })
    fs.writeFileSync(outputPath, preview)
  }

  /**
   * Open diff in external diff tool
   */
  async openInDiffTool(tool: string = 'vimdiff'): Promise<void> {
    if (this.pendingChanges.size === 0) {
      throw new Error('No pending changes to preview')
    }

    // Create temporary files for diff tool
    const tempDir = path.join(this.snapshotDir, 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    for (const [filePath, diff] of this.pendingChanges) {
      const baseName = path.basename(filePath)
      const oldFile = path.join(tempDir, `${baseName}.old`)
      const newFile = path.join(tempDir, `${baseName}.new`)

      fs.writeFileSync(oldFile, diff.oldContent || '')
      fs.writeFileSync(newFile, diff.newContent || '')

      // Open in diff tool
      const child = spawn(tool, [oldFile, newFile], {
        stdio: 'inherit',
      })

      await new Promise((resolve, reject) => {
        child.on('exit', (code) => {
          if (code === 0) resolve(undefined)
          else reject(new Error(`Diff tool exited with code ${code}`))
        })
      })

      // Clean up temp files
      fs.unlinkSync(oldFile)
      fs.unlinkSync(newFile)
    }
  }

  /**
   * Check if there are any pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingChanges.size > 0
  }

  /**
   * Get statistics about pending changes
   */
  getStats(): DiffStats {
    let totalAdditions = 0
    let totalDeletions = 0
    let filesCreated = 0
    let filesModified = 0
    let filesDeleted = 0

    for (const diff of this.pendingChanges.values()) {
      totalAdditions += diff.additions
      totalDeletions += diff.deletions

      switch (diff.type) {
        case 'create':
          filesCreated++
          break
        case 'modify':
          filesModified++
          break
        case 'delete':
          filesDeleted++
          break
      }
    }

    return {
      totalFiles: this.pendingChanges.size,
      filesCreated,
      filesModified,
      filesDeleted,
      totalAdditions,
      totalDeletions,
    }
  }
}

export interface ApplyResult {
  succeeded: string[]
  failed: Array<{ file: string; error: string }>
  totalChanges: number
}

export interface DiffStats {
  totalFiles: number
  filesCreated: number
  filesModified: number
  filesDeleted: number
  totalAdditions: number
  totalDeletions: number
}
