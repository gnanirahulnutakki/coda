import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleDocsCommand } from '../../src/cli/docs.js'
import { DocumentationIndexer } from '../../src/features/documentation-index.js'
import * as fs from 'fs'

vi.mock('../../src/features/documentation-index.js')
vi.mock('../../src/utils/logging.js')
vi.mock('fs')

describe('handleDocsCommand', () => {
  let mockIndexer: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockIndexer = {
      initializeProject: vi.fn(),
      indexDocumentation: vi.fn().mockResolvedValue({ indexed: 1, updated: 0, errors: 0 }),
      search: vi.fn().mockReturnValue([]),
      getIndexStats: vi.fn().mockReturnValue({
        totalChunks: 10,
        totalFiles: 5,
        lastUpdated: '2024-01-01T00:00:00Z',
        filesByType: { '.md': 3, '.rst': 2 },
        largestFiles: [
          { file: 'README.md', chunks: 5 },
          { file: 'guide.md', chunks: 3 },
        ],
      }),
      rebuildIndex: vi.fn().mockResolvedValue({ indexed: 5, updated: 0, errors: 0 }),
      removeFile: vi.fn().mockReturnValue(true),
      exportIndex: vi.fn(),
      importIndex: vi.fn(),
      findSimilarChunks: vi.fn().mockReturnValue([]),
    }

    vi.mocked(DocumentationIndexer).mockImplementation(() => mockIndexer)
    vi.mocked(fs.existsSync).mockReturnValue(true)

    // Mock console.log to avoid output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('should show help when no command provided', async () => {
    await handleDocsCommand([])

    expect(console.log).toHaveBeenCalledWith('Documentation indexing commands:')
  })

  it('should index documentation files', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['index'])

    expect(mockIndexer.indexDocumentation).toHaveBeenCalledWith({ force: false })
    expect(log).toHaveBeenCalledWith('✅ Documentation indexing complete:')
  })

  it('should index with force flag', async () => {
    await handleDocsCommand(['index', '--force'])

    expect(mockIndexer.indexDocumentation).toHaveBeenCalledWith({ force: true })
  })

  it('should index specific files', async () => {
    await handleDocsCommand(['index', 'README.md', 'docs/guide.md'])

    expect(mockIndexer.indexDocumentation).toHaveBeenCalledWith({
      force: false,
      files: ['README.md', 'docs/guide.md'],
    })
  })

  it('should warn about missing files when indexing', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    // Mock fs.existsSync to be called for each file check
    vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
      if (filePath === 'README.md') return true
      if (filePath === 'missing.md') return false
      return false
    })

    await handleDocsCommand(['index', 'README.md', 'missing.md'])

    expect(warn).toHaveBeenCalledWith('Warning: Some files do not exist: missing.md')
    expect(mockIndexer.indexDocumentation).toHaveBeenCalledWith({
      force: false,
      files: ['README.md'],
    })
  })

  it('should warn when no valid files to index', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    vi.mocked(fs.existsSync).mockReturnValue(false)

    await handleDocsCommand(['index', 'missing.md'])

    expect(warn).toHaveBeenCalledWith('No valid files found to index')
  })

  it('should show message when no new files to index', async () => {
    const { log } = await import('../../src/utils/logging.js')

    mockIndexer.indexDocumentation.mockResolvedValue({ indexed: 0, updated: 0, errors: 0 })

    await handleDocsCommand(['index'])

    expect(log).toHaveBeenCalledWith('📚 No new documentation files to index')
  })

  it('should search documentation', async () => {
    const mockResults = [
      {
        chunk: {
          id: 'chunk-1',
          content: 'This is about authentication and security',
          metadata: {
            file: 'docs/auth.md',
            lineStart: 5,
            lineEnd: 10,
            lastModified: 123456789,
            fileHash: 'hash123',
          },
        },
        score: 0.85,
        context: {
          before: 'Previous content',
          after: 'Next content',
        },
      },
    ]

    mockIndexer.search.mockReturnValue(mockResults)

    await handleDocsCommand(['search', 'authentication'])

    expect(mockIndexer.search).toHaveBeenCalledWith('authentication', { limit: 10 })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 results'))
  })

  it('should search with custom limit', async () => {
    await handleDocsCommand(['search', 'authentication', '--limit=5'])

    expect(mockIndexer.search).toHaveBeenCalledWith('authentication', { limit: 5 })
  })

  it('should warn for invalid search limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['search', 'query', '--limit=invalid'])

    expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
  })

  it('should warn when no search query provided', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['search'])

    expect(warn).toHaveBeenCalledWith('Please provide a search query')
  })

  it('should show no results message when search returns empty', async () => {
    mockIndexer.search.mockReturnValue([])

    await handleDocsCommand(['search', 'nonexistent'])

    expect(console.log).toHaveBeenCalledWith('🔍 No results found for: "nonexistent"')
  })

  it('should search with multi-word query', async () => {
    await handleDocsCommand(['search', 'user', 'authentication', 'guide'])

    expect(mockIndexer.search).toHaveBeenCalledWith('user authentication guide', { limit: 10 })
  })

  it('should show index statistics', async () => {
    await handleDocsCommand(['stats'])

    expect(mockIndexer.getIndexStats).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Documentation Index Statistics'),
    )
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Files: 5'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total Chunks: 10'))
  })

  it('should rebuild index', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['rebuild'])

    expect(mockIndexer.rebuildIndex).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('✅ Index rebuilt successfully:')
  })

  it('should remove file from index', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['remove', 'docs/old.md'])

    expect(mockIndexer.removeFile).toHaveBeenCalledWith('docs/old.md')
    expect(log).toHaveBeenCalledWith('✅ Removed docs/old.md from index')
  })

  it('should warn when removing non-existent file', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.removeFile.mockReturnValue(false)

    await handleDocsCommand(['remove', 'nonexistent.md'])

    expect(warn).toHaveBeenCalledWith('File nonexistent.md not found in index')
  })

  it('should warn when no file path provided for remove', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['remove'])

    expect(warn).toHaveBeenCalledWith('Please provide a file path to remove')
  })

  it('should export index', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['export', '/test/export.json'])

    expect(mockIndexer.exportIndex).toHaveBeenCalledWith('/test/export.json')
    expect(log).toHaveBeenCalledWith('✅ Index exported to: /test/export.json')
  })

  it('should warn when no output path provided for export', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['export'])

    expect(warn).toHaveBeenCalledWith('Please provide an output file path')
  })

  it('should import index', async () => {
    const { log } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['import', '/test/import.json'])

    expect(mockIndexer.importIndex).toHaveBeenCalledWith('/test/import.json')
    expect(log).toHaveBeenCalledWith('✅ Index imported from: /test/import.json')
  })

  it('should warn when no input path provided for import', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['import'])

    expect(warn).toHaveBeenCalledWith('Please provide an input file path')
  })

  it('should find similar content', async () => {
    const mockSimilarChunks = [
      {
        chunk: {
          id: 'similar-1',
          content: 'Similar authentication content',
          metadata: {
            file: 'docs/security.md',
            lineStart: 15,
            lineEnd: 20,
            lastModified: 123456789,
            fileHash: 'hash456',
          },
        },
        score: 0.75,
        context: {},
      },
    ]

    // Mock search to find the target chunk
    mockIndexer.search.mockReturnValue([
      {
        chunk: {
          id: 'target',
          content: 'Target authentication content',
          metadata: {
            file: 'docs/auth.md',
            lineStart: 5,
            lineEnd: 10,
            lastModified: 123456789,
            fileHash: 'hash123',
          },
        },
        score: 1.0,
        context: {},
      },
    ])

    mockIndexer.findSimilarChunks.mockReturnValue(mockSimilarChunks)

    await handleDocsCommand(['similar', 'docs/auth.md', '7'])

    expect(mockIndexer.findSimilarChunks).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 similar chunks'))
  })

  it('should warn when no file path provided for similar', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['similar'])

    expect(warn).toHaveBeenCalledWith('Please provide a file path')
  })

  it('should warn when no line number provided for similar', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['similar', 'docs/auth.md'])

    expect(warn).toHaveBeenCalledWith('Please provide a line number')
  })

  it('should warn for invalid line number in similar', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['similar', 'docs/auth.md', 'invalid'])

    expect(warn).toHaveBeenCalledWith('Line number must be a positive integer')
  })

  it('should warn when no index exists for similar search', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.getIndexStats.mockReturnValue({ totalChunks: 0 })

    await handleDocsCommand(['similar', 'docs/auth.md', '5'])

    expect(warn).toHaveBeenCalledWith('No documentation indexed yet. Run "coda docs index" first.')
  })

  it('should warn when target chunk not found for similar', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.search.mockReturnValue([])

    await handleDocsCommand(['similar', 'docs/auth.md', '5'])

    expect(warn).toHaveBeenCalledWith('No indexed content found for docs/auth.md at line 5')
  })

  it('should show message when no similar content found', async () => {
    // Mock search to find the target chunk
    mockIndexer.search.mockReturnValue([
      {
        chunk: {
          id: 'target',
          content: 'Target content',
          metadata: {
            file: 'docs/auth.md',
            lineStart: 5,
            lineEnd: 10,
            lastModified: 123456789,
            fileHash: 'hash123',
          },
        },
        score: 1.0,
        context: {},
      },
    ])

    mockIndexer.findSimilarChunks.mockReturnValue([])

    await handleDocsCommand(['similar', 'docs/auth.md', '7'])

    expect(console.log).toHaveBeenCalledWith('No similar content found for docs/auth.md:7')
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleDocsCommand(['unknown'])

    expect(warn).toHaveBeenCalledWith('Unknown docs command: unknown')
  })

  it('should handle indexing errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.indexDocumentation.mockRejectedValue(new Error('Indexing failed'))

    await handleDocsCommand(['index'])

    expect(warn).toHaveBeenCalledWith('Failed to index documentation: Indexing failed')
  })

  it('should handle search errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.search.mockImplementation(() => {
      throw new Error('Search failed')
    })

    await handleDocsCommand(['search', 'query'])

    expect(warn).toHaveBeenCalledWith('Failed to search documentation: Search failed')
  })

  it('should handle stats errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.getIndexStats.mockImplementation(() => {
      throw new Error('Stats failed')
    })

    await handleDocsCommand(['stats'])

    expect(warn).toHaveBeenCalledWith('Failed to get index statistics: Stats failed')
  })

  it('should handle rebuild errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.rebuildIndex.mockRejectedValue(new Error('Rebuild failed'))

    await handleDocsCommand(['rebuild'])

    expect(warn).toHaveBeenCalledWith('Failed to rebuild index: Rebuild failed')
  })

  it('should handle remove errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.removeFile.mockImplementation(() => {
      throw new Error('Remove failed')
    })

    await handleDocsCommand(['remove', 'file.md'])

    expect(warn).toHaveBeenCalledWith('Failed to remove file: Remove failed')
  })

  it('should handle export errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.exportIndex.mockRejectedValue(new Error('Export failed'))

    await handleDocsCommand(['export', 'output.json'])

    expect(warn).toHaveBeenCalledWith('Failed to export index: Export failed')
  })

  it('should handle import errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.importIndex.mockRejectedValue(new Error('Import failed'))

    await handleDocsCommand(['import', 'input.json'])

    expect(warn).toHaveBeenCalledWith('Failed to import index: Import failed')
  })

  it('should handle similar search errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    mockIndexer.search.mockImplementation(() => {
      throw new Error('Similar search failed')
    })

    await handleDocsCommand(['similar', 'docs/auth.md', '5'])

    expect(warn).toHaveBeenCalledWith('Failed to find similar content: Similar search failed')
  })

  it('should display file types in stats', async () => {
    await handleDocsCommand(['stats'])

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('.md: 3 files'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('.rst: 2 files'))
  })

  it('should display largest files in stats', async () => {
    await handleDocsCommand(['stats'])

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('README.md (5 chunks)'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('guide.md (3 chunks)'))
  })

  it('should handle indexing with errors', async () => {
    const { log, warn } = await import('../../src/utils/logging.js')

    mockIndexer.indexDocumentation.mockResolvedValue({ indexed: 2, updated: 1, errors: 1 })

    await handleDocsCommand(['index'])

    expect(log).toHaveBeenCalledWith('   📄 Indexed: 2 new files')
    expect(log).toHaveBeenCalledWith('   🔄 Updated: 1 files')
    expect(warn).toHaveBeenCalledWith('   ❌ Errors: 1 files failed')
  })

  it('should handle rebuild with errors', async () => {
    const { log, warn } = await import('../../src/utils/logging.js')

    mockIndexer.rebuildIndex.mockResolvedValue({ indexed: 3, updated: 0, errors: 2 })

    await handleDocsCommand(['rebuild'])

    expect(log).toHaveBeenCalledWith('   📄 Indexed: 3 files')
    expect(warn).toHaveBeenCalledWith('   ❌ Errors: 2 files failed')
  })
})
