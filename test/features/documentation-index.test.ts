import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { DocumentationIndexer } from '../../src/features/documentation-index.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')
vi.mock('crypto')

describe('DocumentationIndexer', () => {
  let indexer: DocumentationIndexer
  const mockConfigDir = '/test/.coda'
  const mockProjectPath = '/test/project'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      mtime: new Date('2024-01-01'),
    } as any)

    // Mock crypto
    vi.mocked(crypto.createHash).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mock-hash'),
    } as any)

    indexer = new DocumentationIndexer()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create index directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(mockConfigDir, 'doc-index'), {
        recursive: true,
      })
    })

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks()
      vi.mocked(fs.existsSync).mockReturnValue(true)

      new DocumentationIndexer()

      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('initializeProject', () => {
    it('should set project path and load index', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await indexer.initializeProject(mockProjectPath)

      // Should create new index file when none exists
      const stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBe(0)
      expect(stats.totalFiles).toBe(0)
    })

    it('should load existing index', async () => {
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [
          {
            id: 'chunk-1',
            content: 'Test content',
            metadata: {
              file: 'README.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash123',
            },
          },
        ],
        files: {
          'README.md': {
            hash: 'hash123',
            lastModified: 123456789,
            chunkCount: 1,
          },
        },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))

      await indexer.initializeProject(mockProjectPath)

      const stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBe(1)
      expect(stats.totalFiles).toBe(1)
    })

    it('should handle corrupted index file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      await indexer.initializeProject(mockProjectPath)

      const stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBe(0)
      expect(stats.totalFiles).toBe(0)
    })
  })

  describe('indexDocumentation', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)
    })

    it('should index markdown files', async () => {
      const mockFiles = [
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
        { name: 'docs', isFile: () => false, isDirectory: () => true },
      ]

      const mockDocsFiles = [{ name: 'guide.md', isFile: () => true, isDirectory: () => false }]

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(mockFiles as any)
        .mockReturnValueOnce(mockDocsFiles as any)

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('# Test README\n\nThis is a test file.')
        .mockReturnValueOnce('# Guide\n\nThis is a guide.')

      const result = await indexer.indexDocumentation()

      expect(result.indexed).toBeGreaterThan(0)
      expect(result.errors).toBe(0)
    })

    it('should skip files that match exclude patterns', async () => {
      const mockFiles = [
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
        { name: 'node_modules', isFile: () => false, isDirectory: () => true },
      ]

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as any)
      vi.mocked(fs.readFileSync).mockReturnValue('# Test README\n\nThis is a test file.')

      const result = await indexer.indexDocumentation()

      // Should only process README.md, not node_modules
      expect(result.indexed).toBe(1)
    })

    it('should update existing files when content changes', async () => {
      // First index a file
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
      ] as any)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# Original content')

      const firstResult = await indexer.indexDocumentation()
      expect(firstResult.indexed).toBe(1)

      // Change the hash to simulate file change
      vi.mocked(crypto.createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('new-hash'),
      } as any)
      vi.mocked(fs.readFileSync).mockReturnValue('# Updated content')

      const secondResult = await indexer.indexDocumentation()
      expect(secondResult.updated).toBe(1)
    })

    it('should skip unchanged files', async () => {
      // Index a file first
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
      ] as any)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# Test content')

      const firstResult = await indexer.indexDocumentation()
      expect(firstResult.indexed).toBe(1)

      // Index again without changes
      const secondResult = await indexer.indexDocumentation()
      expect(secondResult.indexed).toBe(0)
      expect(secondResult.updated).toBe(0)
    })

    it('should force reindex when force option is true', async () => {
      // Index a file first
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
      ] as any)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# Test content')

      const firstResult = await indexer.indexDocumentation()
      expect(firstResult.indexed).toBe(1)

      // Force reindex
      const secondResult = await indexer.indexDocumentation({ force: true })
      expect(secondResult.updated).toBe(1)
    })

    it('should handle file read errors gracefully', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
      ] as any)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await indexer.indexDocumentation()

      expect(result.errors).toBe(1)
      expect(result.indexed).toBe(0)
    })

    it('should index specific files when provided', async () => {
      const specificFiles = ['/test/project/custom.md']

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# Custom file')

      const result = await indexer.indexDocumentation({ files: specificFiles })

      expect(result.indexed).toBe(1)
      expect(fs.readdirSync).not.toHaveBeenCalled() // Should not scan directory
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)

      // Mock an existing index with content
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [
          {
            id: 'chunk-1',
            content: 'This is a guide about authentication and security',
            metadata: {
              file: 'docs/auth.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash123',
            },
          },
          {
            id: 'chunk-2',
            content: 'Installation instructions for the application',
            metadata: {
              file: 'README.md',
              lineStart: 10,
              lineEnd: 15,
              lastModified: 123456789,
              fileHash: 'hash456',
            },
          },
        ],
        files: {},
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))
      await indexer.initializeProject(mockProjectPath)
    })

    it('should find relevant chunks for query', () => {
      const results = indexer.search('authentication')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].chunk.content).toContain('authentication')
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should return results sorted by score', () => {
      const results = indexer.search('guide authentication')

      // First result should have higher score
      if (results.length > 1) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
      }
    })

    it('should limit results when limit is specified', () => {
      const results = indexer.search('installation', { limit: 1 })

      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('should filter by threshold', () => {
      const results = indexer.search('nonexistent', { threshold: 0.8 })

      expect(results.length).toBe(0)
    })

    it('should include context for search results', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        'Line 1\nLine 2\nThis is a guide about authentication and security\nLine 4\nLine 5\nLine 6',
      )

      const results = indexer.search('authentication')

      if (results.length > 0) {
        expect(results[0].context).toBeDefined()
      }
    })
  })

  describe('getIndexStats', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)
    })

    it('should return correct statistics', () => {
      const stats = indexer.getIndexStats()

      expect(stats).toMatchObject({
        totalChunks: expect.any(Number),
        totalFiles: expect.any(Number),
        lastUpdated: expect.any(String),
        filesByType: expect.any(Object),
        largestFiles: expect.any(Array),
      })
    })

    it('should group files by type', async () => {
      // Mock an index with different file types
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [],
        files: {
          'README.md': { hash: 'hash1', lastModified: 123456789, chunkCount: 2 },
          'guide.rst': { hash: 'hash2', lastModified: 123456789, chunkCount: 3 },
          LICENSE: { hash: 'hash3', lastModified: 123456789, chunkCount: 1 },
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))
      await indexer.initializeProject(mockProjectPath)

      const stats = indexer.getIndexStats()

      expect(stats.filesByType['.md']).toBe(1)
      expect(stats.filesByType['.rst']).toBe(1)
      expect(stats.filesByType['no extension']).toBe(1)
    })

    it('should identify largest files by chunk count', async () => {
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [],
        files: {
          'small.md': { hash: 'hash1', lastModified: 123456789, chunkCount: 1 },
          'large.md': { hash: 'hash2', lastModified: 123456789, chunkCount: 10 },
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))
      await indexer.initializeProject(mockProjectPath)

      const stats = indexer.getIndexStats()

      expect(stats.largestFiles[0].file).toBe('large.md')
      expect(stats.largestFiles[0].chunks).toBe(10)
    })
  })

  describe('rebuildIndex', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)
    })

    it('should clear existing index and rebuild', async () => {
      // First add some content
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'README.md', isFile: () => true, isDirectory: () => false },
      ] as any)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('# Test content')

      await indexer.indexDocumentation()
      let stats = indexer.getIndexStats()
      const initialCount = stats.totalChunks

      // Rebuild
      const result = await indexer.rebuildIndex()

      expect(result.indexed).toBeGreaterThan(0)
      stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBeGreaterThan(0)
    })
  })

  describe('removeFile', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)

      // Mock an index with a file
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [
          {
            id: 'chunk-1',
            content: 'Test content',
            metadata: {
              file: 'README.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash123',
            },
          },
        ],
        files: {
          'README.md': {
            hash: 'hash123',
            lastModified: 123456789,
            chunkCount: 1,
          },
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))
      await indexer.initializeProject(mockProjectPath)
    })

    it('should remove file and its chunks', () => {
      const result = indexer.removeFile(path.join(mockProjectPath, 'README.md'))

      expect(result).toBe(true)

      const stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBe(0)
      expect(stats.totalFiles).toBe(0)
    })

    it('should return false for non-existent file', () => {
      const result = indexer.removeFile(path.join(mockProjectPath, 'nonexistent.md'))

      expect(result).toBe(false)
    })
  })

  describe('export/import', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)
    })

    it('should export index to file', async () => {
      const outputPath = '/test/export.json'

      await indexer.exportIndex(outputPath)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('"projectId"'),
      )
    })

    it('should throw error when no project initialized for export', async () => {
      const newIndexer = new DocumentationIndexer()

      await expect(newIndexer.exportIndex('/test/export.json')).rejects.toThrow(
        'No project initialized',
      )
    })

    it('should import index from file', async () => {
      const importIndex = {
        projectId: 'imported-id',
        projectPath: '/imported/path',
        lastUpdated: '2024-01-01',
        chunks: [
          {
            id: 'imported-chunk',
            content: 'Imported content',
            metadata: {
              file: 'imported.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'imported-hash',
            },
          },
        ],
        files: {
          'imported.md': {
            hash: 'imported-hash',
            lastModified: 123456789,
            chunkCount: 1,
          },
        },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importIndex))

      await indexer.importIndex('/test/import.json')

      const stats = indexer.getIndexStats()
      expect(stats.totalChunks).toBe(1)
    })

    it('should throw error for invalid import file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{"invalid": "data"}')

      await expect(indexer.importIndex('/test/import.json')).rejects.toThrow(
        'Invalid index file format',
      )
    })

    it('should throw error for non-existent import file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(indexer.importIndex('/test/nonexistent.json')).rejects.toThrow(
        'Import file not found',
      )
    })
  })

  describe('findSimilarChunks', () => {
    beforeEach(async () => {
      await indexer.initializeProject(mockProjectPath)

      // Mock an index with similar content
      const mockIndex = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        chunks: [
          {
            id: 'chunk-1',
            content: 'This is about authentication and security measures',
            metadata: {
              file: 'auth.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash123',
            },
          },
          {
            id: 'chunk-2',
            content: 'Authentication guide for developers',
            metadata: {
              file: 'dev-guide.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash456',
            },
          },
          {
            id: 'chunk-3',
            content: 'Installation instructions',
            metadata: {
              file: 'install.md',
              lineStart: 1,
              lineEnd: 5,
              lastModified: 123456789,
              fileHash: 'hash789',
            },
          },
        ],
        files: {},
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))
      await indexer.initializeProject(mockProjectPath)
    })

    it('should find similar chunks', () => {
      const targetChunk = {
        id: 'target',
        content: 'Security and authentication best practices',
        metadata: {
          file: 'security.md',
          lineStart: 1,
          lineEnd: 5,
          lastModified: 123456789,
          fileHash: 'target-hash',
        },
      }

      const results = indexer.findSimilarChunks(targetChunk)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should exclude the target chunk itself', () => {
      const targetChunk = {
        id: 'chunk-1',
        content: 'This is about authentication and security measures',
        metadata: {
          file: 'auth.md',
          lineStart: 1,
          lineEnd: 5,
          lastModified: 123456789,
          fileHash: 'hash123',
        },
      }

      const results = indexer.findSimilarChunks(targetChunk)

      // Should not include the chunk with same ID
      expect(results.every((r) => r.chunk.id !== 'chunk-1')).toBe(true)
    })

    it('should limit results', () => {
      const targetChunk = {
        id: 'target',
        content: 'Authentication',
        metadata: {
          file: 'test.md',
          lineStart: 1,
          lineEnd: 5,
          lastModified: 123456789,
          fileHash: 'target-hash',
        },
      }

      const results = indexer.findSimilarChunks(targetChunk, 1)

      expect(results.length).toBeLessThanOrEqual(1)
    })
  })

  describe('error handling', () => {
    it('should throw error when searching without project initialization', () => {
      const newIndexer = new DocumentationIndexer()

      expect(() => newIndexer.search('test')).toThrow('No project initialized')
    })

    it('should throw error when getting stats without project initialization', () => {
      const newIndexer = new DocumentationIndexer()

      expect(() => newIndexer.getIndexStats()).toThrow('No project initialized')
    })

    it('should handle directory scan errors gracefully', async () => {
      await indexer.initializeProject(mockProjectPath)

      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = await indexer.indexDocumentation()

      // Should not crash, just return empty results
      expect(result.indexed).toBe(0)
      expect(result.errors).toBe(0)
    })
  })
})
