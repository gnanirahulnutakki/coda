import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { CheckpointManager } from '../../src/features/checkpoint.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')
vi.mock('crypto')

describe('CheckpointManager', () => {
  let checkpointManager: CheckpointManager
  const mockConfigDir = '/test/.coda'
  const mockProjectPath = '/test/project'
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)
    
    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('[]')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      mtime: new Date('2024-01-01'),
    } as any)
    
    // Mock crypto
    vi.mocked(crypto.randomBytes).mockReturnValue(Buffer.from('12345678'))
    vi.mocked(crypto.createHash).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mock-hash'),
    } as any)
    
    checkpointManager = new CheckpointManager()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create checkpoints directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join(mockConfigDir, 'checkpoints'),
        { recursive: true }
      )
    })

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks()
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      new CheckpointManager()
      
      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('initializeProject', () => {
    it('should set project path and generate project ID', async () => {
      await checkpointManager.initializeProject(mockProjectPath)
      
      // Project ID should be base64 encoded path with special chars removed
      const expectedId = Buffer.from(mockProjectPath).toString('base64').replace(/[/+=]/g, '')
      
      // Test by trying to create a checkpoint (which requires project initialization)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content')
      
      const id = await checkpointManager.createCheckpoint('test', ['test.txt'])
      expect(id).toBeDefined()
    })
  })

  describe('createCheckpoint', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should create checkpoint with valid files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content')
      
      const id = await checkpointManager.createCheckpoint('Test checkpoint', ['test.txt'])
      
      expect(id).toBe('3132333435363738') // hex of mocked randomBytes
      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should include metadata in checkpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content')
      
      await checkpointManager.createCheckpoint('Test checkpoint', ['test.txt'], {
        command: 'test command',
        provider: 'claude-code'
      })
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const checkpointData = JSON.parse(writeCall[1] as string)
      
      expect(checkpointData[0].metadata).toMatchObject({
        project: 'project',
        cwd: mockProjectPath,
        command: 'test command',
        provider: 'claude-code'
      })
    })

    it('should throw error when no valid files found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      await expect(
        checkpointManager.createCheckpoint('Test checkpoint', ['nonexistent.txt'])
      ).rejects.toThrow('No valid files found to checkpoint')
    })

    it('should throw error when no project initialized', async () => {
      const manager = new CheckpointManager()
      
      await expect(
        manager.createCheckpoint('Test checkpoint', ['test.txt'])
      ).rejects.toThrow('No project initialized')
    })

    it('should limit checkpoints to 50 entries', async () => {
      // Create a fresh checkpoint manager for this test
      const manager = new CheckpointManager()
      await manager.initializeProject(mockProjectPath)
      
      // Mock existing 50 checkpoints
      const existingCheckpoints = Array.from({ length: 50 }, (_, i) => ({
        id: `checkpoint-${i}`,
        timestamp: new Date().toISOString(),
        description: `Checkpoint ${i}`,
        files: [],
        metadata: { project: 'test', cwd: '/test' }
      }))
      
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // checkpoints file exists for loadCheckpoints
        .mockReturnValueOnce(true) // test.txt exists for captureFileSnapshot
      
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(existingCheckpoints)) // Load existing checkpoints
        .mockReturnValueOnce('test content') // Read file content for new checkpoint
      
      await manager.createCheckpoint('New checkpoint', ['test.txt'])
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.slice(-1)[0] // Get the last write call
      const savedCheckpoints = JSON.parse(writeCall[1] as string)
      
      expect(savedCheckpoints).toHaveLength(50)
      expect(savedCheckpoints[49].description).toBe('New checkpoint')
      expect(savedCheckpoints[0].description).toBe('Checkpoint 1') // First checkpoint should be removed
    })
  })

  describe('createAutoCheckpoint', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should create auto checkpoint with descriptive message', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content')
      
      await checkpointManager.createAutoCheckpoint(['test.txt'], 'update auth')
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const checkpointData = JSON.parse(writeCall[1] as string)
      
      expect(checkpointData[0].description).toBe('Auto-checkpoint before AI changes: update auth')
      expect(checkpointData[0].metadata.command).toBe('update auth')
    })

    it('should create auto checkpoint without command', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValueOnce('test content')
      
      await checkpointManager.createAutoCheckpoint(['test.txt'])
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const checkpointData = JSON.parse(writeCall[1] as string)
      
      expect(checkpointData[0].description).toBe('Auto-checkpoint before AI changes')
    })
  })

  describe('listCheckpoints', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should return empty array when no checkpoints exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const checkpoints = checkpointManager.listCheckpoints()
      expect(checkpoints).toEqual([])
    })

    it('should return checkpoints sorted by timestamp (newest first)', () => {
      const mockCheckpoints = [
        {
          id: 'old',
          timestamp: '2024-01-01T10:00:00Z',
          description: 'Old checkpoint',
          files: [],
          metadata: { project: 'test', cwd: '/test' }
        },
        {
          id: 'new',
          timestamp: '2024-01-02T10:00:00Z',
          description: 'New checkpoint',
          files: [],
          metadata: { project: 'test', cwd: '/test' }
        }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCheckpoints))
      
      const checkpoints = checkpointManager.listCheckpoints()
      
      expect(checkpoints).toHaveLength(2)
      expect(checkpoints[0].id).toBe('new')
      expect(checkpoints[1].id).toBe('old')
    })

    it('should limit results when limit specified', () => {
      const mockCheckpoints = Array.from({ length: 5 }, (_, i) => ({
        id: `checkpoint-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        description: `Checkpoint ${i}`,
        files: [],
        metadata: { project: 'test', cwd: '/test' }
      }))
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCheckpoints))
      
      const checkpoints = checkpointManager.listCheckpoints(3)
      expect(checkpoints).toHaveLength(3)
    })
  })

  describe('getCheckpoint', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should return checkpoint by ID', () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockCheckpoint]))
      
      const checkpoint = checkpointManager.getCheckpoint('test-id')
      expect(checkpoint).toEqual(mockCheckpoint)
    })

    it('should return null for non-existent checkpoint', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      const checkpoint = checkpointManager.getCheckpoint('nonexistent')
      expect(checkpoint).toBeNull()
    })
  })

  describe('rollbackToCheckpoint', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should rollback files successfully', async () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [
          {
            path: 'test.txt',
            content: 'original content',
            hash: 'original-hash',
            lastModified: 123456789
          }
        ],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockCheckpoint]))
      
      const result = await checkpointManager.rollbackToCheckpoint('test-id')
      
      expect(result.success).toBe(true)
      expect(result.files).toEqual(['test.txt'])
      expect(result.errors).toEqual([])
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'original content'
      )
    })

    it('should perform dry run without writing files', async () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [
          {
            path: 'test.txt',
            content: 'original content',
            hash: 'original-hash',
            lastModified: 123456789
          }
        ],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockCheckpoint]))
      
      const result = await checkpointManager.rollbackToCheckpoint('test-id', { dryRun: true })
      
      expect(result.success).toBe(true)
      expect(result.files).toEqual(['test.txt'])
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should throw error for non-existent checkpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      await expect(
        checkpointManager.rollbackToCheckpoint('nonexistent')
      ).rejects.toThrow('Checkpoint nonexistent not found')
    })

    it('should handle file write errors gracefully', async () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [
          {
            path: 'test.txt',
            content: 'original content',
            hash: 'original-hash',
            lastModified: 123456789
          }
        ],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockCheckpoint]))
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Write failed')
      })
      
      const result = await checkpointManager.rollbackToCheckpoint('test-id')
      
      expect(result.success).toBe(false)
      expect(result.files).toEqual([])
      expect(result.errors).toEqual(['test.txt: Write failed'])
    })
  })

  describe('deleteCheckpoint', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should delete existing checkpoint', async () => {
      const mockCheckpoints = [
        { id: 'keep', timestamp: '2024-01-01', description: 'Keep', files: [], metadata: { project: 'test', cwd: '/test' } },
        { id: 'delete', timestamp: '2024-01-02', description: 'Delete', files: [], metadata: { project: 'test', cwd: '/test' } }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCheckpoints))
      
      const result = await checkpointManager.deleteCheckpoint('delete')
      
      expect(result).toBe(true)
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const savedCheckpoints = JSON.parse(writeCall[1] as string)
      expect(savedCheckpoints).toHaveLength(1)
      expect(savedCheckpoints[0].id).toBe('keep')
    })

    it('should return false for non-existent checkpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      const result = await checkpointManager.deleteCheckpoint('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('cleanupOldCheckpoints', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should remove checkpoints older than specified days', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 40)
      
      const recentDate = new Date()
      
      const mockCheckpoints = [
        { id: 'old', timestamp: oldDate.toISOString(), description: 'Old', files: [], metadata: { project: 'test', cwd: '/test' } },
        { id: 'recent', timestamp: recentDate.toISOString(), description: 'Recent', files: [], metadata: { project: 'test', cwd: '/test' } }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCheckpoints))
      
      const removedCount = await checkpointManager.cleanupOldCheckpoints(30)
      
      expect(removedCount).toBe(1)
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const savedCheckpoints = JSON.parse(writeCall[1] as string)
      expect(savedCheckpoints).toHaveLength(1)
      expect(savedCheckpoints[0].id).toBe('recent')
    })

    it('should return 0 when no old checkpoints found', async () => {
      const recentDate = new Date()
      
      const mockCheckpoints = [
        { id: 'recent', timestamp: recentDate.toISOString(), description: 'Recent', files: [], metadata: { project: 'test', cwd: '/test' } }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockCheckpoints))
      
      const removedCount = await checkpointManager.cleanupOldCheckpoints(30)
      
      expect(removedCount).toBe(0)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe('export/import', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should export checkpoint to file', async () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([mockCheckpoint]))
      
      await checkpointManager.exportCheckpoint('test-id', '/test/export.json')
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/export.json',
        JSON.stringify(mockCheckpoint, null, 2)
      )
    })

    it('should throw error when exporting non-existent checkpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      await expect(
        checkpointManager.exportCheckpoint('nonexistent', '/test/export.json')
      ).rejects.toThrow('Checkpoint nonexistent not found')
    })

    it('should import checkpoint from file', async () => {
      const importCheckpoint = {
        id: 'original-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Imported checkpoint',
        files: [
          {
            path: 'test.txt',
            content: 'test content',
            hash: 'hash123',
            lastModified: 123456789
          }
        ],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('[]') // existing checkpoints
        .mockReturnValueOnce(JSON.stringify(importCheckpoint)) // import file
      
      const newId = await checkpointManager.importCheckpoint('/test/import.json')
      
      expect(newId).toBe('3132333435363738') // new generated ID
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const savedCheckpoints = JSON.parse(writeCall[1] as string)
      expect(savedCheckpoints).toHaveLength(1)
      expect(savedCheckpoints[0].id).toBe('3132333435363738')
      expect(savedCheckpoints[0].description).toBe('Imported checkpoint (imported)')
    })

    it('should throw error for invalid import file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('[]')
        .mockReturnValueOnce('{"invalid": "data"}')
      
      await expect(
        checkpointManager.importCheckpoint('/test/import.json')
      ).rejects.toThrow('Invalid checkpoint file format')
    })

    it('should throw error for non-existent import file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      await expect(
        checkpointManager.importCheckpoint('/test/nonexistent.json')
      ).rejects.toThrow('Import file not found: /test/nonexistent.json')
    })
  })

  describe('getDiffSummary', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should detect file changes correctly', () => {
      const mockCheckpoint = {
        id: 'test-id',
        timestamp: '2024-01-01T10:00:00Z',
        description: 'Test checkpoint',
        files: [
          {
            path: 'unchanged.txt',
            content: 'same content',
            hash: 'same-hash',
            lastModified: 123456789
          },
          {
            path: 'changed.txt',
            content: 'old content',
            hash: 'old-hash',
            lastModified: 123456789
          },
          {
            path: 'deleted.txt',
            content: 'deleted content',
            hash: 'deleted-hash',
            lastModified: 123456789
          }
        ],
        metadata: { project: 'test', cwd: '/test' }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify([mockCheckpoint]))
        .mockReturnValueOnce('same content')
        .mockReturnValueOnce('new content')
      
      // Mock file existence checks
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // checkpoints file exists
        .mockReturnValueOnce(true) // unchanged.txt exists
        .mockReturnValueOnce(true) // changed.txt exists
        .mockReturnValueOnce(false) // deleted.txt doesn't exist
      
      // Mock hash calculations
      vi.mocked(crypto.createHash)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          digest: vi.fn().mockReturnValue('same-hash'),
        } as any)
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          digest: vi.fn().mockReturnValue('new-hash'),
        } as any)
      
      const diff = checkpointManager.getDiffSummary('test-id')
      
      expect(diff).toEqual([
        { file: 'unchanged.txt', changed: false, reason: 'No changes' },
        { file: 'changed.txt', changed: true, reason: 'Content modified' },
        { file: 'deleted.txt', changed: true, reason: 'File deleted since checkpoint' }
      ])
    })

    it('should throw error for non-existent checkpoint', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      expect(() => checkpointManager.getDiffSummary('nonexistent'))
        .toThrow('Checkpoint nonexistent not found')
    })
  })

  describe('error handling', () => {
    beforeEach(async () => {
      await checkpointManager.initializeProject(mockProjectPath)
    })

    it('should handle corrupted checkpoints file gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')
      
      const checkpoints = checkpointManager.listCheckpoints()
      expect(checkpoints).toEqual([])
    })

    it('should handle file capture errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('File access error')
      })
      
      await expect(
        checkpointManager.createCheckpoint('Test', ['error-file.txt'])
      ).rejects.toThrow('No valid files found to checkpoint')
    })
  })
})