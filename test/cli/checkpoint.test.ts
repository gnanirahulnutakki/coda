import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleCheckpointCommand } from '../../src/cli/checkpoint.js'
import { CheckpointManager } from '../../src/features/checkpoint.js'
import * as fs from 'fs'

vi.mock('../../src/features/checkpoint.js')
vi.mock('../../src/utils/logging.js')
vi.mock('fs')

describe('handleCheckpointCommand', () => {
  let mockManager: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockManager = {
      initializeProject: vi.fn(),
      createCheckpoint: vi.fn().mockResolvedValue('test-id'),
      createAutoCheckpoint: vi.fn().mockResolvedValue('auto-id'),
      listCheckpoints: vi.fn().mockReturnValue([]),
      getCheckpoint: vi.fn().mockReturnValue(null),
      rollbackToCheckpoint: vi.fn().mockResolvedValue({ success: true, files: [], errors: [] }),
      deleteCheckpoint: vi.fn().mockResolvedValue(true),
      getDiffSummary: vi.fn().mockReturnValue([]),
      exportCheckpoint: vi.fn(),
      importCheckpoint: vi.fn().mockResolvedValue('imported-id'),
      cleanupOldCheckpoints: vi.fn().mockResolvedValue(0),
    }

    vi.mocked(CheckpointManager).mockImplementation(() => mockManager)
    vi.mocked(fs.existsSync).mockReturnValue(true)

    // Mock console.log to avoid output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('should show help when no command provided', async () => {
    await handleCheckpointCommand([])

    expect(console.log).toHaveBeenCalledWith('Checkpoint management commands:')
  })

  it('should create checkpoint with description and files', async () => {
    await handleCheckpointCommand(['create', 'Test checkpoint', 'file1.txt', 'file2.txt'])

    expect(mockManager.createCheckpoint).toHaveBeenCalledWith('Test checkpoint', [
      'file1.txt',
      'file2.txt',
    ])
  })

  it('should warn when creating checkpoint without description', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['create'])

    expect(warn).toHaveBeenCalledWith('Please provide a description for the checkpoint')
  })

  it('should warn when creating checkpoint without files', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['create', 'Test description'])

    expect(warn).toHaveBeenCalledWith('Please specify files to include in the checkpoint')
  })

  it('should warn about missing files when creating checkpoint', async () => {
    const { warn, log } = await import('../../src/utils/logging.js')

    // Mock fs.existsSync to be called for each file in the order they're checked
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
      if (filePath === 'file1.txt') return true
      if (filePath === 'file2.txt') return false
      return false
    })

    await handleCheckpointCommand(['create', 'Test', 'file1.txt', 'file2.txt'])

    expect(warn).toHaveBeenCalledWith('Warning: Some files do not exist: file2.txt')
    expect(mockManager.createCheckpoint).toHaveBeenCalledWith('Test', ['file1.txt'])
    expect(log).toHaveBeenCalledWith('✅ Checkpoint created: test-id')
  })

  it('should warn when no valid files exist', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    vi.mocked(fs.existsSync).mockReturnValue(false)

    await handleCheckpointCommand(['create', 'Test', 'nonexistent.txt'])

    expect(warn).toHaveBeenCalledWith('No valid files found to checkpoint')
  })

  it('should list checkpoints without limit', async () => {
    const mockCheckpoints = [
      {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [{ path: 'test.txt' }],
        metadata: { project: 'test', command: 'test command' },
      },
    ]

    mockManager.listCheckpoints.mockReturnValue(mockCheckpoints)

    await handleCheckpointCommand(['list'])

    expect(mockManager.listCheckpoints).toHaveBeenCalledWith(undefined)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-id'))
  })

  it('should list checkpoints with limit', async () => {
    await handleCheckpointCommand(['list', '5'])

    expect(mockManager.listCheckpoints).toHaveBeenCalledWith(5)
  })

  it('should warn for invalid limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['list', 'invalid'])

    expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
  })

  it('should show empty message when no checkpoints exist', async () => {
    mockManager.listCheckpoints.mockReturnValue([])

    await handleCheckpointCommand(['list'])

    expect(console.log).toHaveBeenCalledWith('No checkpoints found for this project.')
  })

  it('should show checkpoint details', async () => {
    const mockCheckpoint = {
      id: 'test-id',
      timestamp: '2024-01-01T10:00:00Z',
      description: 'Test checkpoint',
      files: [
        {
          path: 'test.txt',
          content: 'test content',
          hash: 'abcdef1234567890abcdef1234567890',
          lastModified: 1234567890000,
        },
      ],
      metadata: {
        project: 'test',
        command: 'test command',
        provider: 'claude-code',
      },
    }

    mockManager.getCheckpoint.mockReturnValue(mockCheckpoint)

    await handleCheckpointCommand(['show', 'test-id'])

    expect(mockManager.getCheckpoint).toHaveBeenCalledWith('test-id')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-id'))
  })

  it('should warn when showing non-existent checkpoint', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    mockManager.getCheckpoint.mockReturnValue(null)

    await handleCheckpointCommand(['show', 'nonexistent'])

    expect(warn).toHaveBeenCalledWith('Checkpoint nonexistent not found')
  })

  it('should warn when showing checkpoint without ID', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['show'])

    expect(warn).toHaveBeenCalledWith('Please provide a checkpoint ID')
  })

  it('should rollback to checkpoint', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockManager.rollbackToCheckpoint.mockResolvedValue({
      success: true,
      files: ['file1.txt', 'file2.txt'],
      errors: [],
    })

    await handleCheckpointCommand(['rollback', 'test-id'])

    expect(mockManager.rollbackToCheckpoint).toHaveBeenCalledWith('test-id', { dryRun: false })
    expect(log).toHaveBeenCalledWith('✅ Rollback successful - restored 2 files:')
  })

  it('should perform dry run rollback', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockManager.rollbackToCheckpoint.mockResolvedValue({
      success: true,
      files: ['file1.txt'],
      errors: [],
    })

    await handleCheckpointCommand(['rollback', 'test-id', '--dry-run'])

    expect(mockManager.rollbackToCheckpoint).toHaveBeenCalledWith('test-id', { dryRun: true })
    expect(log).toHaveBeenCalledWith('✅ Dry run successful - would restore 1 files:')
  })

  it('should handle rollback errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.rollbackToCheckpoint.mockResolvedValue({
      success: false,
      files: ['file1.txt'],
      errors: ['file2.txt: Permission denied'],
    })

    await handleCheckpointCommand(['rollback', 'test-id'])

    expect(warn).toHaveBeenCalledWith('❌ Rollback completed with errors:')
  })

  it('should delete checkpoint', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockManager.deleteCheckpoint.mockResolvedValue(true)

    await handleCheckpointCommand(['delete', 'test-id'])

    expect(mockManager.deleteCheckpoint).toHaveBeenCalledWith('test-id')
    expect(log).toHaveBeenCalledWith('✅ Checkpoint test-id deleted')
  })

  it('should warn when deleting non-existent checkpoint', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.deleteCheckpoint.mockResolvedValue(false)

    await handleCheckpointCommand(['delete', 'nonexistent'])

    expect(warn).toHaveBeenCalledWith('Checkpoint nonexistent not found')
  })

  it('should show diff summary', async () => {
    const mockDiff = [
      { file: 'unchanged.txt', changed: false, reason: 'No changes' },
      { file: 'changed.txt', changed: true, reason: 'Content modified' },
      { file: 'deleted.txt', changed: true, reason: 'File deleted since checkpoint' },
    ]

    mockManager.getDiffSummary.mockReturnValue(mockDiff)

    await handleCheckpointCommand(['diff', 'test-id'])

    expect(mockManager.getDiffSummary).toHaveBeenCalledWith('test-id')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Changed (2)'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Unchanged (1)'))
  })

  it('should show no changes message when diff is empty', async () => {
    mockManager.getDiffSummary.mockReturnValue([
      { file: 'file.txt', changed: false, reason: 'No changes' },
    ])

    await handleCheckpointCommand(['diff', 'test-id'])

    expect(console.log).toHaveBeenCalledWith(
      '\\x1b[32m🎉 No changes detected since checkpoint!\\x1b[0m',
    )
  })

  it('should export checkpoint', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['export', 'test-id', '/test/export.json'])

    expect(mockManager.exportCheckpoint).toHaveBeenCalledWith('test-id', '/test/export.json')
    expect(log).toHaveBeenCalledWith('✅ Checkpoint exported to: /test/export.json')
  })

  it('should warn when exporting without ID', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['export'])

    expect(warn).toHaveBeenCalledWith('Please provide a checkpoint ID')
  })

  it('should warn when exporting without output path', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['export', 'test-id'])

    expect(warn).toHaveBeenCalledWith('Please provide an output file path')
  })

  it('should import checkpoint', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['import', '/test/import.json'])

    expect(mockManager.importCheckpoint).toHaveBeenCalledWith('/test/import.json')
    expect(log).toHaveBeenCalledWith('✅ Checkpoint imported with ID: imported-id')
  })

  it('should warn when importing without path', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['import'])

    expect(warn).toHaveBeenCalledWith('Please provide an input file path')
  })

  it('should cleanup old checkpoints with default days', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockManager.cleanupOldCheckpoints.mockResolvedValue(5)

    await handleCheckpointCommand(['cleanup'])

    expect(mockManager.cleanupOldCheckpoints).toHaveBeenCalledWith(30)
    expect(log).toHaveBeenCalledWith('✅ Cleaned up 5 old checkpoints')
  })

  it('should cleanup old checkpoints with custom days', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockManager.cleanupOldCheckpoints.mockResolvedValue(0)

    await handleCheckpointCommand(['cleanup', '60'])

    expect(mockManager.cleanupOldCheckpoints).toHaveBeenCalledWith(60)
    expect(log).toHaveBeenCalledWith('No old checkpoints found to clean up')
  })

  it('should warn for invalid cleanup days', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['cleanup', 'invalid'])

    expect(warn).toHaveBeenCalledWith('Days must be a positive number')
  })

  it('should create auto checkpoint with specified files', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['auto', 'file1.txt', 'file2.txt'])

    expect(mockManager.createAutoCheckpoint).toHaveBeenCalledWith(['file1.txt', 'file2.txt'])
    expect(log).toHaveBeenCalledWith('✅ Auto-checkpoint created: auto-id')
  })

  it('should create auto checkpoint with common files when none specified', async () => {
    const { log } = await import('../../src/utils/logging.js')

    // Mock the order of files as they appear in the commonFiles array in checkpoint.ts
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(true) // package.json exists
      .mockReturnValueOnce(false) // src doesn't exist
      .mockReturnValueOnce(true) // lib exists
      .mockReturnValueOnce(true) // index.js exists
      .mockReturnValueOnce(true) // index.ts exists
      .mockReturnValueOnce(true) // main.js exists
      .mockReturnValueOnce(true) // main.ts exists

    await handleCheckpointCommand(['auto'])

    expect(mockManager.createAutoCheckpoint).toHaveBeenCalledWith([
      'package.json',
      'lib',
      'index.js',
      'index.ts',
      'main.js',
      'main.ts',
    ])
    expect(log).toHaveBeenCalledWith('✅ Auto-checkpoint created: auto-id')
  })

  it('should warn when no files for auto checkpoint', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    vi.mocked(fs.existsSync).mockReturnValue(false)

    await handleCheckpointCommand(['auto'])

    expect(warn).toHaveBeenCalledWith('No files specified and no common project files found')
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleCheckpointCommand(['unknown'])

    expect(warn).toHaveBeenCalledWith('Unknown checkpoint command: unknown')
  })

  it('should handle checkpoint creation errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.createCheckpoint.mockRejectedValue(new Error('Creation failed'))

    await handleCheckpointCommand(['create', 'Test', 'file.txt'])

    expect(warn).toHaveBeenCalledWith('Failed to create checkpoint: Creation failed')
  })

  it('should handle rollback errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.rollbackToCheckpoint.mockRejectedValue(new Error('Rollback failed'))

    await handleCheckpointCommand(['rollback', 'test-id'])

    expect(warn).toHaveBeenCalledWith('Failed to rollback: Rollback failed')
  })

  it('should handle export errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.exportCheckpoint.mockRejectedValue(new Error('Export failed'))

    await handleCheckpointCommand(['export', 'test-id', 'output.json'])

    expect(warn).toHaveBeenCalledWith('Failed to export checkpoint: Export failed')
  })

  it('should handle import errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockManager.importCheckpoint.mockRejectedValue(new Error('Import failed'))

    await handleCheckpointCommand(['import', 'input.json'])

    expect(warn).toHaveBeenCalledWith('Failed to import checkpoint: Import failed')
  })
})
