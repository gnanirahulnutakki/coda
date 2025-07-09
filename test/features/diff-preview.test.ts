import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { DiffPreviewer } from '../../src/features/diff-preview.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('child_process')
vi.mock('../../src/config/paths.js')

describe('DiffPreviewer', () => {
  let diffPreviewer: DiffPreviewer
  const mockConfigDir = '/test/.coda'
  const mockSnapshotDir = '/test/.coda/diff-snapshots'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project')

    diffPreviewer = new DiffPreviewer()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create snapshot directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockSnapshotDir, { recursive: true })
    })

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks()
      vi.mocked(fs.existsSync).mockReturnValue(true)

      new DiffPreviewer()

      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('addFileChange', () => {
    it('should add a file modification', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('old content')

      diffPreviewer.addFileChange('test.js', 'new content')

      const pendingFiles = diffPreviewer.getPendingFiles()
      expect(pendingFiles).toHaveLength(1)
      expect(pendingFiles[0]).toBe('/test/project/test.js')
    })

    it('should add a file creation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      diffPreviewer.addFileChange('new-file.js', 'new content', 'create')

      const pendingFiles = diffPreviewer.getPendingFiles()
      expect(pendingFiles).toHaveLength(1)
      expect(pendingFiles[0]).toBe('/test/project/new-file.js')
    })

    it('should handle multiple file changes', () => {
      diffPreviewer.addFileChange('file1.js', 'content 1')
      diffPreviewer.addFileChange('file2.js', 'content 2')
      diffPreviewer.addFileChange('file3.js', 'content 3')

      const pendingFiles = diffPreviewer.getPendingFiles()
      expect(pendingFiles).toHaveLength(3)
    })

    it('should replace existing change for same file', () => {
      diffPreviewer.addFileChange('test.js', 'content 1')
      diffPreviewer.addFileChange('test.js', 'content 2')

      const pendingFiles = diffPreviewer.getPendingFiles()
      expect(pendingFiles).toHaveLength(1)
    })
  })

  describe('addFileDeletion', () => {
    it('should add a file deletion', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('file content')

      diffPreviewer.addFileDeletion('test.js')

      const pendingFiles = diffPreviewer.getPendingFiles()
      expect(pendingFiles).toHaveLength(1)
      expect(pendingFiles[0]).toBe('/test/project/test.js')
    })

    it('should throw error if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => {
        diffPreviewer.addFileDeletion('nonexistent.js')
      }).toThrow('File nonexistent.js does not exist')
    })
  })

  describe('getPreview', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('line 1\nline 2\nline 3')
    })

    it('should return message when no pending changes', () => {
      const preview = diffPreviewer.getPreview()
      expect(preview).toBe('No pending changes to preview')
    })

    it('should generate unified diff format', () => {
      diffPreviewer.addFileChange('test.js', 'line 1\nmodified line 2\nline 3')

      const preview = diffPreviewer.getPreview({ colorize: false })

      expect(preview).toContain('--- test.js')
      expect(preview).toContain('+++ test.js')
      expect(preview).toContain('@@ -')
      expect(preview).toContain('-line 2')
      expect(preview).toContain('+modified line 2')
      expect(preview).toContain('Changes: +1, -1')
    })

    it('should show file creation diff', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      diffPreviewer.addFileChange('new.js', 'new file content', 'create')

      const preview = diffPreviewer.getPreview({ colorize: false })

      expect(preview).toContain('+++ new.js (new file)')
      expect(preview).toContain('+new file content')
    })

    it('should show file deletion diff', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('deleted content')

      diffPreviewer.addFileDeletion('old.js')

      const preview = diffPreviewer.getPreview({ colorize: false })

      expect(preview).toContain('--- old.js (deleted)')
      expect(preview).toContain('-deleted content')
    })

    it('should handle multiple file changes', () => {
      diffPreviewer.addFileChange('file1.js', 'modified content 1')
      diffPreviewer.addFileChange('file2.js', 'modified content 2')

      const preview = diffPreviewer.getPreview({ colorize: false })

      expect(preview).toContain('file1.js')
      expect(preview).toContain('file2.js')
      expect(preview).toContain('modified content 1')
      expect(preview).toContain('modified content 2')
    })

    it('should include color codes when colorize is true', () => {
      diffPreviewer.addFileChange('test.js', 'line 1\nmodified line 2\nline 3')

      const preview = diffPreviewer.getPreview({ colorize: true })

      expect(preview).toContain('\x1b[36m') // Header color
      expect(preview).toContain('\x1b[32m') // Add color
      expect(preview).toContain('\x1b[31m') // Delete color
      expect(preview).toContain('\x1b[0m') // Reset color
    })

    it('should generate side-by-side diff format', () => {
      diffPreviewer.addFileChange('test.js', 'line 1\nmodified line 2\nline 3')

      const preview = diffPreviewer.getPreview({ sideBySide: true, colorize: false })

      expect(preview).toContain('File: test.js')
      expect(preview).toContain('OLD')
      expect(preview).toContain('NEW')
      expect(preview).toContain('│')
    })

    it('should generate simple diff format', () => {
      diffPreviewer.addFileChange('test.js', 'modified content')

      const preview = diffPreviewer.getPreview({ unifiedFormat: false, colorize: false })

      expect(preview).toContain('File: test.js')
      expect(preview).toContain('[MODIFIED]')
      expect(preview).toContain('Changes:')
    })
  })

  describe('diff computation', () => {
    it('should correctly compute additions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('line 1\nline 2')

      diffPreviewer.addFileChange('test.js', 'line 1\nline 2\nline 3\nline 4')

      const stats = diffPreviewer.getStats()
      expect(stats.totalAdditions).toBe(2)
      expect(stats.totalDeletions).toBe(0)
    })

    it('should correctly compute deletions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('line 1\nline 2\nline 3')

      diffPreviewer.addFileChange('test.js', 'line 1')

      const stats = diffPreviewer.getStats()
      expect(stats.totalAdditions).toBe(0)
      expect(stats.totalDeletions).toBe(2)
    })

    it('should correctly compute modifications', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('line 1\nline 2\nline 3')

      diffPreviewer.addFileChange('test.js', 'line 1\nmodified line\nline 3')

      const stats = diffPreviewer.getStats()
      expect(stats.totalAdditions).toBe(1)
      expect(stats.totalDeletions).toBe(1)
    })

    it('should handle empty files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('')

      diffPreviewer.addFileChange('test.js', 'new content')

      const preview = diffPreviewer.getPreview({ colorize: false })
      expect(preview).toContain('+new content')
    })

    it('should handle files with no changes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('same content')

      diffPreviewer.addFileChange('test.js', 'same content')

      const stats = diffPreviewer.getStats()
      expect(stats.totalAdditions).toBe(0)
      expect(stats.totalDeletions).toBe(0)
    })
  })

  describe('applyChanges', () => {
    it('should apply file modifications', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('old content')

      diffPreviewer.addFileChange('test.js', 'new content')

      const result = await diffPreviewer.applyChanges()

      expect(fs.writeFileSync).toHaveBeenCalledWith('/test/project/test.js', 'new content')
      expect(result.succeeded).toContain('/test/project/test.js')
      expect(result.failed).toHaveLength(0)
      expect(result.totalChanges).toBe(1)
    })

    it('should apply file creations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      diffPreviewer.addFileChange('new.js', 'new content', 'create')

      const result = await diffPreviewer.applyChanges()

      expect(fs.writeFileSync).toHaveBeenCalledWith('/test/project/new.js', 'new content')
      expect(result.succeeded).toContain('/test/project/new.js')
    })

    it('should create directories for new files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      diffPreviewer.addFileChange('dir/subdir/new.js', 'content', 'create')

      await diffPreviewer.applyChanges()

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname('/test/project/dir/subdir/new.js'), {
        recursive: true,
      })
    })

    it('should apply file deletions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('content')

      diffPreviewer.addFileDeletion('old.js')

      const result = await diffPreviewer.applyChanges()

      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/project/old.js')
      expect(result.succeeded).toContain('/test/project/old.js')
    })

    it('should handle apply errors', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      diffPreviewer.addFileChange('test.js', 'content')

      const result = await diffPreviewer.applyChanges()

      expect(result.succeeded).toHaveLength(0)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]).toEqual({
        file: '/test/project/test.js',
        error: 'Permission denied',
      })
    })

    it('should clear pending changes after applying', async () => {
      diffPreviewer.addFileChange('test.js', 'content')

      expect(diffPreviewer.hasPendingChanges()).toBe(true)

      await diffPreviewer.applyChanges()

      expect(diffPreviewer.hasPendingChanges()).toBe(false)
    })

    it('should apply multiple changes', async () => {
      diffPreviewer.addFileChange('file1.js', 'content 1')
      diffPreviewer.addFileChange('file2.js', 'content 2', 'create')
      diffPreviewer.addFileDeletion('file3.js')

      const result = await diffPreviewer.applyChanges()

      expect(result.succeeded).toHaveLength(3)
      expect(result.totalChanges).toBe(3)
    })
  })

  describe('discardChanges', () => {
    it('should clear all pending changes', () => {
      diffPreviewer.addFileChange('file1.js', 'content')
      diffPreviewer.addFileChange('file2.js', 'content')

      expect(diffPreviewer.hasPendingChanges()).toBe(true)

      diffPreviewer.discardChanges()

      expect(diffPreviewer.hasPendingChanges()).toBe(false)
      expect(diffPreviewer.getPendingFiles()).toHaveLength(0)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return !path.toString().includes('new')
      })
      vi.mocked(fs.readFileSync).mockReturnValue('old content')

      diffPreviewer.addFileChange('modified.js', 'new content')
      diffPreviewer.addFileChange('new.js', 'content', 'create')
      diffPreviewer.addFileDeletion('deleted.js')

      const stats = diffPreviewer.getStats()

      expect(stats.totalFiles).toBe(3)
      expect(stats.filesCreated).toBe(1)
      expect(stats.filesModified).toBe(1)
      expect(stats.filesDeleted).toBe(1)
    })

    it('should return zero stats when no changes', () => {
      const stats = diffPreviewer.getStats()

      expect(stats.totalFiles).toBe(0)
      expect(stats.filesCreated).toBe(0)
      expect(stats.filesModified).toBe(0)
      expect(stats.filesDeleted).toBe(0)
      expect(stats.totalAdditions).toBe(0)
      expect(stats.totalDeletions).toBe(0)
    })
  })

  describe('savePreview', () => {
    it('should save preview to file', () => {
      diffPreviewer.addFileChange('test.js', 'new content')

      diffPreviewer.savePreview('/output/preview.diff')

      expect(fs.writeFileSync).toHaveBeenCalledWith('/output/preview.diff', expect.any(String))
    })

    it('should save without color codes', () => {
      diffPreviewer.addFileChange('test.js', 'new content')

      diffPreviewer.savePreview('/output/preview.diff', { colorize: true })

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const content = writeCall[1] as string

      expect(content).not.toContain('\x1b[')
    })
  })

  describe('openInDiffTool', () => {
    it('should open files in external diff tool', async () => {
      const mockSpawn = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') callback(0)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockSpawn as any)

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('old content')

      diffPreviewer.addFileChange('test.js', 'new content')

      await diffPreviewer.openInDiffTool('vimdiff')

      expect(spawn).toHaveBeenCalledWith(
        'vimdiff',
        expect.arrayContaining([
          expect.stringContaining('test.js.old'),
          expect.stringContaining('test.js.new'),
        ]),
        { stdio: 'inherit' },
      )
    })

    it('should create temp directory if needed', async () => {
      const mockSpawn = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') callback(0)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockSpawn as any)

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return !path.toString().includes('temp')
      })

      diffPreviewer.addFileChange('test.js', 'content')

      await diffPreviewer.openInDiffTool()

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('temp'), {
        recursive: true,
      })
    })

    it('should clean up temp files after diff tool exits', async () => {
      const mockSpawn = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') callback(0)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockSpawn as any)

      diffPreviewer.addFileChange('test.js', 'content')

      await diffPreviewer.openInDiffTool()

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2) // old and new temp files
    })

    it('should throw error when no pending changes', async () => {
      await expect(diffPreviewer.openInDiffTool()).rejects.toThrow('No pending changes to preview')
    })

    it('should handle diff tool exit with error', async () => {
      const mockSpawn = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') callback(1)
        }),
      }
      vi.mocked(spawn).mockReturnValue(mockSpawn as any)

      diffPreviewer.addFileChange('test.js', 'content')

      await expect(diffPreviewer.openInDiffTool()).rejects.toThrow('Diff tool exited with code 1')
    })
  })

  describe('hasPendingChanges', () => {
    it('should return false when no changes', () => {
      expect(diffPreviewer.hasPendingChanges()).toBe(false)
    })

    it('should return true when changes exist', () => {
      diffPreviewer.addFileChange('test.js', 'content')
      expect(diffPreviewer.hasPendingChanges()).toBe(true)
    })
  })

  describe('getPendingFiles', () => {
    it('should return empty array when no changes', () => {
      expect(diffPreviewer.getPendingFiles()).toEqual([])
    })

    it('should return list of files with changes', () => {
      diffPreviewer.addFileChange('file1.js', 'content')
      diffPreviewer.addFileChange('file2.js', 'content')

      const files = diffPreviewer.getPendingFiles()

      expect(files).toHaveLength(2)
      expect(files).toContain('/test/project/file1.js')
      expect(files).toContain('/test/project/file2.js')
    })
  })

  describe('multiline diff handling', () => {
    it('should handle files with many lines', () => {
      const oldContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
      const newContent = Array.from({ length: 100 }, (_, i) =>
        i === 50 ? 'modified line' : `line ${i + 1}`,
      ).join('\n')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(oldContent)

      diffPreviewer.addFileChange('large.js', newContent)

      const preview = diffPreviewer.getPreview({ colorize: false })

      expect(preview).toContain('modified line')
      expect(preview).toContain('@@ -')
    })

    it('should handle Windows line endings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('line1\r\nline2\r\nline3')

      diffPreviewer.addFileChange('test.js', 'line1\r\nmodified\r\nline3')

      const stats = diffPreviewer.getStats()
      expect(stats.totalAdditions).toBe(1)
      expect(stats.totalDeletions).toBe(1)
    })
  })
})
