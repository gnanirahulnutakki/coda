import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as readline from 'readline'
import { handleDiffCommand } from '../../src/cli/diff.js'
import { DiffPreviewer } from '../../src/features/diff-preview.js'

vi.mock('fs')
vi.mock('readline')
vi.mock('../../src/utils/logging.js')

// We need to mock the module properly
let mockDiffPreviewer: any

vi.mock('../../src/features/diff-preview.js', () => {
  return {
    DiffPreviewer: vi.fn(() => mockDiffPreviewer),
  }
})

describe('handleDiffCommand', () => {
  let mockReadline: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockDiffPreviewer = {
      addFileChange: vi.fn(),
      addFileDeletion: vi.fn(),
      getPreview: vi.fn().mockReturnValue('mock diff preview'),
      getStats: vi.fn().mockReturnValue({
        totalFiles: 2,
        filesCreated: 1,
        filesModified: 1,
        filesDeleted: 0,
        totalAdditions: 10,
        totalDeletions: 5,
      }),
      hasPendingChanges: vi.fn().mockReturnValue(true),
      getPendingFiles: vi.fn().mockReturnValue(['/test/file1.js', '/test/file2.js']),
      applyChanges: vi.fn().mockResolvedValue({
        succeeded: ['/test/file1.js', '/test/file2.js'],
        failed: [],
        totalChanges: 2,
      }),
      discardChanges: vi.fn(),
      savePreview: vi.fn(),
      openInDiffTool: vi.fn(),
      // Add private member access for interactive mode
      pendingChanges: new Map([
        ['/test/file1.js', { newContent: 'test content', type: 'modify' }],
        ['/test/file2.js', { newContent: 'new file content', type: 'create' }],
      ]),
    }

    // The mock is already set up above

    // Mock readline
    mockReadline = {
      question: vi.fn((question, callback) => callback('y')),
      close: vi.fn(),
    }

    vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any)

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock fs
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  it('should show help when no command provided', async () => {
    await handleDiffCommand([])

    expect(console.log).toHaveBeenCalledWith('Diff preview commands:')
  })

  describe('add command', () => {
    it('should add file modification', async () => {
      const { log } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['add', 'test.js', 'console.log("hello")'])

      expect(mockDiffPreviewer.addFileChange).toHaveBeenCalledWith(
        'test.js',
        'console.log("hello")',
        'modify',
      )
      expect(log).toHaveBeenCalledWith('✅ Added file modification to preview: test.js')
      expect(log).toHaveBeenCalledWith('📊 Pending changes: 2 files (+10 -5)')
    })

    it('should add file creation when file does not exist', async () => {
      const { log } = await import('../../src/utils/logging.js')
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await handleDiffCommand(['add', 'new.js', 'content'])

      expect(mockDiffPreviewer.addFileChange).toHaveBeenCalledWith('new.js', 'content', 'create')
      expect(log).toHaveBeenCalledWith('✅ Added new file to preview: new.js')
    })

    it('should handle multi-word content', async () => {
      await handleDiffCommand(['add', 'test.js', 'const', 'x', '=', '42'])

      expect(mockDiffPreviewer.addFileChange).toHaveBeenCalledWith(
        'test.js',
        'const x = 42',
        'modify',
      )
    })

    it('should warn when missing arguments', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['add', 'test.js'])

      expect(warn).toHaveBeenCalledWith('Usage: coda diff add <file> <content>')
    })

    it('should handle add errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      mockDiffPreviewer.addFileChange.mockImplementation(() => {
        throw new Error('Add failed')
      })

      await handleDiffCommand(['add', 'test.js', 'content'])

      expect(warn).toHaveBeenCalledWith('Failed to add file change: Add failed')
    })
  })

  describe('add-stdin command', () => {
    it('should add file change from stdin', async () => {
      const { log } = await import('../../src/utils/logging.js')

      // Mock readline for stdin
      const mockRl = {
        [Symbol.asyncIterator]: async function* () {
          yield 'line 1'
          yield 'line 2'
        },
      }
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any)

      await handleDiffCommand(['add-stdin', 'test.js'])

      expect(mockDiffPreviewer.addFileChange).toHaveBeenCalledWith(
        'test.js',
        'line 1\nline 2',
        'modify',
      )
      expect(log).toHaveBeenCalledWith('✅ Added file modification to preview: test.js')
    })

    it('should warn when missing file argument', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['add-stdin'])

      expect(warn).toHaveBeenCalledWith('Usage: coda diff add-stdin <file>')
    })
  })

  describe('delete command', () => {
    it('should add file deletion', async () => {
      const { log } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['delete', 'test.js'])

      expect(mockDiffPreviewer.addFileDeletion).toHaveBeenCalledWith('test.js')
      expect(log).toHaveBeenCalledWith('✅ Added file deletion to preview: test.js')
      expect(log).toHaveBeenCalledWith('📊 Pending changes: 2 files (+10 -5)')
    })

    it('should warn when missing file argument', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['delete'])

      expect(warn).toHaveBeenCalledWith('Usage: coda diff delete <file>')
    })

    it('should handle delete errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      mockDiffPreviewer.addFileDeletion.mockImplementation(() => {
        throw new Error('File not found')
      })

      await handleDiffCommand(['delete', 'test.js'])

      expect(warn).toHaveBeenCalledWith('Failed to add file deletion: File not found')
    })
  })

  describe('show command', () => {
    it('should show diff preview', async () => {
      await handleDiffCommand(['show'])

      expect(mockDiffPreviewer.getPreview).toHaveBeenCalledWith({
        colorize: true,
        unifiedFormat: true,
        sideBySide: false,
      })
      expect(console.log).toHaveBeenCalledWith('mock diff preview')
    })

    it('should show side-by-side format', async () => {
      await handleDiffCommand(['show', '--format=side'])

      expect(mockDiffPreviewer.getPreview).toHaveBeenCalledWith({
        colorize: true,
        unifiedFormat: false,
        sideBySide: true,
      })
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['show'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to preview')
    })
  })

  describe('stats command', () => {
    it('should show statistics', async () => {
      await handleDiffCommand(['stats'])

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Diff Statistics'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total files: 2'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Files created: 1'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('+ Additions: 10'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('- Deletions: 5'))
    })

    it('should show message when no changes', async () => {
      mockDiffPreviewer.getStats.mockReturnValue({
        totalFiles: 0,
        filesCreated: 0,
        filesModified: 0,
        filesDeleted: 0,
        totalAdditions: 0,
        totalDeletions: 0,
      })

      await handleDiffCommand(['stats'])

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No pending changes'))
    })
  })

  describe('apply command', () => {
    it('should apply changes when confirmed', async () => {
      const { log } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['apply'])

      expect(mockReadline.question).toHaveBeenCalledWith(
        'Apply these changes? (y/N): ',
        expect.any(Function),
      )
      expect(mockDiffPreviewer.applyChanges).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully applied changes'),
      )
      expect(log).toHaveBeenCalledWith('📊 Applied 2/2 changes')
    })

    it('should not apply when cancelled', async () => {
      mockReadline.question.mockImplementation((question, callback) => callback('n'))

      await handleDiffCommand(['apply'])

      expect(mockDiffPreviewer.applyChanges).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('Changes not applied')
    })

    it('should show failed changes', async () => {
      mockDiffPreviewer.applyChanges.mockResolvedValue({
        succeeded: ['/test/file1.js'],
        failed: [{ file: '/test/file2.js', error: 'Permission denied' }],
        totalChanges: 2,
      })

      await handleDiffCommand(['apply'])

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed to apply changes'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Permission denied'))
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['apply'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to apply')
    })

    it('should handle apply errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      mockDiffPreviewer.applyChanges.mockRejectedValue(new Error('Apply failed'))

      await handleDiffCommand(['apply'])

      expect(warn).toHaveBeenCalledWith('Failed to apply changes: Apply failed')
    })
  })

  describe('discard command', () => {
    it('should discard changes when confirmed', async () => {
      const { log } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['discard'])

      expect(mockReadline.question).toHaveBeenCalledWith(
        'Discard 2 pending changes? (y/N): ',
        expect.any(Function),
      )
      expect(mockDiffPreviewer.discardChanges).toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith('✅ All pending changes discarded')
    })

    it('should not discard when cancelled', async () => {
      mockReadline.question.mockImplementation((question, callback) => callback('n'))

      await handleDiffCommand(['discard'])

      expect(mockDiffPreviewer.discardChanges).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('Changes not discarded')
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['discard'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to discard')
    })
  })

  describe('save command', () => {
    it('should save diff to file', async () => {
      const { log } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['save', '/output/diff.patch'])

      expect(mockDiffPreviewer.savePreview).toHaveBeenCalledWith('/output/diff.patch')
      expect(log).toHaveBeenCalledWith('✅ Diff saved to: /output/diff.patch')
    })

    it('should warn when missing output file', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      await handleDiffCommand(['save'])

      expect(warn).toHaveBeenCalledWith('Usage: coda diff save <output-file>')
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['save', 'output.diff'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to save')
    })

    it('should handle save errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      mockDiffPreviewer.savePreview.mockImplementation(() => {
        throw new Error('Save failed')
      })

      await handleDiffCommand(['save', 'output.diff'])

      expect(warn).toHaveBeenCalledWith('Failed to save diff: Save failed')
    })
  })

  describe('tool command', () => {
    it('should open in default diff tool', async () => {
      await handleDiffCommand(['tool'])

      expect(console.log).toHaveBeenCalledWith('Opening diff in vimdiff...')
      expect(mockDiffPreviewer.openInDiffTool).toHaveBeenCalledWith('vimdiff')
    })

    it('should open in specified diff tool', async () => {
      await handleDiffCommand(['tool', 'meld'])

      expect(console.log).toHaveBeenCalledWith('Opening diff in meld...')
      expect(mockDiffPreviewer.openInDiffTool).toHaveBeenCalledWith('meld')
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['tool'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to preview')
    })

    it('should handle tool errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')

      mockDiffPreviewer.openInDiffTool.mockRejectedValue(new Error('Tool not found'))

      await handleDiffCommand(['tool'])

      expect(warn).toHaveBeenCalledWith('Failed to open diff tool: Tool not found')
    })
  })

  describe('interactive command', () => {
    it('should enter interactive review mode', async () => {
      // Mock interactive prompts
      let questionCount = 0
      mockReadline.question.mockImplementation((question, callback) => {
        if (question.includes('Action?')) {
          // Answer based on question count
          if (questionCount === 0) {
            callback('a') // Apply first file
          } else {
            callback('q') // Quit on second file
          }
          questionCount++
        } else {
          callback('y')
        }
      })

      // Mock private member access
      mockDiffPreviewer.pendingChanges = new Map([
        ['/test/file1.js', { newContent: 'content1', type: 'modify' }],
        ['/test/file2.js', { newContent: 'content2', type: 'modify' }],
      ])

      await handleDiffCommand(['interactive'])

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Interactive Diff Review'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Reviewing 2 files'))
    })

    it('should show message when no pending changes', async () => {
      mockDiffPreviewer.hasPendingChanges.mockReturnValue(false)

      await handleDiffCommand(['interactive'])

      expect(console.log).toHaveBeenCalledWith('No pending changes to review')
    })
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDiffCommand(['unknown'])

    expect(warn).toHaveBeenCalledWith('Unknown diff command: unknown')
  })

  it('should use singleton diff previewer', async () => {
    // Clear the constructor mock calls
    vi.mocked(DiffPreviewer).mockClear()

    // Run multiple commands
    await handleDiffCommand(['add', 'file1.js', 'content1'])
    await handleDiffCommand(['add', 'file2.js', 'content2'])
    await handleDiffCommand(['stats'])

    // Should only create one instance
    expect(DiffPreviewer).toHaveBeenCalledTimes(1)
  })
})
