import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleMemoryCommand } from '../../src/cli/memory.js'
import { ContextMemory } from '../../src/features/context-memory.js'

vi.mock('../../src/features/context-memory.js')
vi.mock('../../src/utils/logging.js')

describe('handleMemoryCommand', () => {
  let mockMemory: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockMemory = {
      loadProjectContext: vi.fn(),
      getContextSummary: vi.fn().mockReturnValue(''),
      getRecentContext: vi.fn().mockReturnValue([]),
      searchContext: vi.fn().mockReturnValue([]),
      exportMemory: vi.fn(),
      importMemory: vi.fn(),
      cleanupOldMemory: vi.fn(),
      updateProjectMetadata: vi.fn(),
    }

    vi.mocked(ContextMemory).mockImplementation(() => mockMemory)

    // Mock console.log to avoid output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('should show help when no command provided', async () => {
    await handleMemoryCommand([])

    expect(console.log).toHaveBeenCalledWith('Memory management commands:')
  })

  it('should show context summary', async () => {
    const mockSummary = '# Project Summary\nTest project'
    const mockEntries = [
      {
        id: '1',
        timestamp: '2024-01-01T10:00:00Z',
        type: 'command' as const,
        content: 'Test command',
      },
    ]

    mockMemory.getContextSummary.mockReturnValue(mockSummary)
    mockMemory.getRecentContext.mockReturnValue(mockEntries)

    await handleMemoryCommand(['show'])

    expect(mockMemory.loadProjectContext).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(mockSummary)
  })

  it('should search context entries', async () => {
    const mockResults = [
      {
        id: '1',
        timestamp: '2024-01-01T10:00:00Z',
        type: 'file_edit' as const,
        content: 'Updated authentication logic',
        metadata: { file: 'src/auth.ts' },
      },
    ]

    mockMemory.searchContext.mockReturnValue(mockResults)

    await handleMemoryCommand(['search', 'auth'])

    expect(mockMemory.searchContext).toHaveBeenCalledWith('auth')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 results for "auth"'))
  })

  it('should handle search with no results', async () => {
    mockMemory.searchContext.mockReturnValue([])

    await handleMemoryCommand(['search', 'nonexistent'])

    expect(console.log).toHaveBeenCalledWith('No results found for: "nonexistent"')
  })

  it('should require query for search', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleMemoryCommand(['search'])

    expect(warn).toHaveBeenCalledWith('Please provide a search query')
  })

  it('should export context to file', async () => {
    await handleMemoryCommand(['export', '/test/export.json'])

    expect(mockMemory.exportMemory).toHaveBeenCalledWith('/test/export.json')
  })

  it('should require file path for export', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleMemoryCommand(['export'])

    expect(warn).toHaveBeenCalledWith('Please provide a file path for export')
  })

  it('should import context from file', async () => {
    await handleMemoryCommand(['import', '/test/import.json'])

    expect(mockMemory.importMemory).toHaveBeenCalledWith('/test/import.json')
  })

  it('should require file path for import', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleMemoryCommand(['import'])

    expect(warn).toHaveBeenCalledWith('Please provide a file path for import')
  })

  it('should cleanup old memory', async () => {
    await handleMemoryCommand(['cleanup'])

    expect(mockMemory.cleanupOldMemory).toHaveBeenCalled()
  })

  it('should update project summary', async () => {
    await handleMemoryCommand(['summary', '--summary', 'New summary'])

    expect(mockMemory.updateProjectMetadata).toHaveBeenCalledWith({
      summary: 'New summary',
    })
  })

  it('should update project architecture', async () => {
    await handleMemoryCommand(['summary', '--architecture', 'Microservices'])

    expect(mockMemory.updateProjectMetadata).toHaveBeenCalledWith({
      architecture: 'Microservices',
    })
  })

  it('should add key decision', async () => {
    await handleMemoryCommand(['summary', '--decision', 'Use PostgreSQL'])

    expect(mockMemory.updateProjectMetadata).toHaveBeenCalledWith({
      keyDecisions: ['Use PostgreSQL'],
    })
  })

  it('should handle multiple metadata updates', async () => {
    await handleMemoryCommand([
      'summary',
      '--summary',
      'Test project',
      '--architecture',
      'Monolith',
      '--decision',
      'Use React',
    ])

    expect(mockMemory.updateProjectMetadata).toHaveBeenCalledWith({
      summary: 'Test project',
      architecture: 'Monolith',
      keyDecisions: ['Use React'],
    })
  })

  it('should show summary help when no args provided', async () => {
    await handleMemoryCommand(['summary'])

    expect(console.log).toHaveBeenCalledWith('Update project metadata:')
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')

    await handleMemoryCommand(['unknown'])

    expect(warn).toHaveBeenCalledWith('Unknown memory command: unknown')
  })

  it('should handle export errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    mockMemory.exportMemory.mockRejectedValue(new Error('Export failed'))

    await handleMemoryCommand(['export', '/test/export.json'])

    expect(warn).toHaveBeenCalledWith('Failed to export context: Export failed')
  })

  it('should handle import errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    mockMemory.importMemory.mockRejectedValue(new Error('Import failed'))

    await handleMemoryCommand(['import', '/test/import.json'])

    expect(warn).toHaveBeenCalledWith('Failed to import context: Import failed')
  })
})
