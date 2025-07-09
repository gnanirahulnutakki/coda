import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import { handleOfflineCommand } from '../../src/cli/offline.js'
import { OfflineCacheManager } from '../../src/features/offline-cache.js'

vi.mock('fs')
vi.mock('../../src/features/offline-cache.js')

describe('offline CLI', () => {
  let mockManager: any
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let processExitSpy: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Mock OfflineCacheManager
    mockManager = {
      isEnabled: vi.fn(),
      setEnabled: vi.fn(),
      getStats: vi.fn(),
      saveResponse: vi.fn(),
      findResponse: vi.fn(),
      getCachedResponse: vi.fn(),
      searchCache: vi.fn(),
      deleteEntry: vi.fn(),
      clearCache: vi.fn(),
      cleanup: vi.fn(),
      exportCache: vi.fn(),
      importCache: vi.fn(),
      updateConfig: vi.fn(),
      addTags: vi.fn(),
    }

    vi.mocked(OfflineCacheManager).mockImplementation(() => mockManager)

    // Mock fs
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handleOfflineCommand([])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Offline Mode'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'))
    })

    it('should display help for help command', async () => {
      await handleOfflineCommand(['help'])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Offline Mode'))
    })
  })

  describe('status command', () => {
    it('should show offline mode status', async () => {
      mockManager.isEnabled.mockReturnValue(true)
      mockManager.getStats.mockReturnValue({
        totalEntries: 10,
        totalSize: 1024 * 1024, // 1 MB
        averageResponseSize: 102400,
        hitRate: 0.75,
        oldestEntry: '2024-01-01T00:00:00Z',
        newestEntry: '2024-01-10T00:00:00Z',
        providers: {
          claude: 7,
          gemini: 3,
        },
      })

      await handleOfflineCommand(['status'])

      expect(consoleLogSpy).toHaveBeenCalledWith('Status: ✓ Enabled')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Total entries: 10')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Total size: 1.00 MB')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Cache hit rate: 75.0%')
      expect(consoleLogSpy).toHaveBeenCalledWith('  claude: 7 entries')
      expect(consoleLogSpy).toHaveBeenCalledWith('  gemini: 3 entries')
    })

    it('should show disabled status', async () => {
      mockManager.isEnabled.mockReturnValue(false)
      mockManager.getStats.mockReturnValue({
        totalEntries: 0,
        totalSize: 0,
        averageResponseSize: 0,
        providers: {},
      })

      await handleOfflineCommand(['status'])

      expect(consoleLogSpy).toHaveBeenCalledWith('Status: ✗ Disabled')
    })
  })

  describe('enable command', () => {
    it('should enable offline mode', async () => {
      await handleOfflineCommand(['enable'])

      expect(mockManager.setEnabled).toHaveBeenCalledWith(true)
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Offline mode enabled')
    })
  })

  describe('disable command', () => {
    it('should disable offline mode', async () => {
      await handleOfflineCommand(['disable'])

      expect(mockManager.setEnabled).toHaveBeenCalledWith(false)
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Offline mode disabled')
    })
  })

  describe('search command', () => {
    it('should search cached responses', async () => {
      const mockResults = [
        {
          id: 'cache-123',
          prompt: 'How to write unit tests for TypeScript?',
          response: 'To write unit tests in TypeScript...',
          provider: 'claude',
          model: 'claude-3',
          timestamp: '2024-01-01T00:00:00Z',
          tags: ['testing', 'typescript'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]

      mockManager.searchCache.mockResolvedValue(mockResults)

      await handleOfflineCommand(['search', 'unit', 'test'])

      expect(mockManager.searchCache).toHaveBeenCalledWith('unit test', 10)
      expect(consoleLogSpy).toHaveBeenCalledWith('\nFound 1 matching response(s):\n')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('[cache-123]'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('claude (claude-3)'))
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tags: testing, typescript'),
      )
    })

    it('should handle no search results', async () => {
      mockManager.searchCache.mockResolvedValue([])

      await handleOfflineCommand(['search', 'nonexistent'])

      expect(consoleLogSpy).toHaveBeenCalledWith('\nNo matching cached responses found.')
    })

    it('should require search query', async () => {
      await expect(handleOfflineCommand(['search'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Search query required')
    })

    it('should show expired entries', async () => {
      const mockResults = [
        {
          id: 'expired-123',
          prompt: 'Test prompt',
          response: 'Test response',
          provider: 'test',
          timestamp: '2024-01-01T00:00:00Z',
          expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
        },
      ]

      mockManager.searchCache.mockResolvedValue(mockResults)

      await handleOfflineCommand(['search', 'test'])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('EXPIRED'))
    })
  })

  describe('show command', () => {
    it('should display help for show command', async () => {
      await handleOfflineCommand(['show', 'cache-123'])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('To view cached entries'))
    })

    it('should require cache ID', async () => {
      await expect(handleOfflineCommand(['show'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Cache entry ID required')
    })
  })

  describe('delete command', () => {
    it('should delete cache entry', async () => {
      mockManager.deleteEntry.mockReturnValue(true)

      await handleOfflineCommand(['delete', 'cache-123'])

      expect(mockManager.deleteEntry).toHaveBeenCalledWith('cache-123')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Deleted cache entry: cache-123')
    })

    it('should handle entry not found', async () => {
      mockManager.deleteEntry.mockReturnValue(false)

      await expect(handleOfflineCommand(['delete', 'nonexistent'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Cache entry not found: nonexistent')
    })

    it('should require cache ID', async () => {
      await expect(handleOfflineCommand(['delete'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Cache entry ID required')
    })
  })

  describe('clear command', () => {
    it('should clear cache', async () => {
      mockManager.getStats.mockReturnValue({ totalEntries: 5 })

      await handleOfflineCommand(['clear'])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('This will delete 5 cached response(s)'),
      )
      expect(mockManager.clearCache).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('\n✓ Cache cleared successfully')
    })

    it('should handle empty cache', async () => {
      mockManager.getStats.mockReturnValue({ totalEntries: 0 })

      await handleOfflineCommand(['clear'])

      expect(consoleLogSpy).toHaveBeenCalledWith('Cache is already empty.')
      expect(mockManager.clearCache).not.toHaveBeenCalled()
    })
  })

  describe('cleanup command', () => {
    it('should cleanup expired entries', async () => {
      mockManager.cleanup.mockReturnValue(3)
      mockManager.getStats.mockReturnValue({
        totalEntries: 7,
        totalSize: 512000,
      })

      await handleOfflineCommand(['cleanup'])

      expect(mockManager.cleanup).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Removed 3 expired cache entries')
      expect(consoleLogSpy).toHaveBeenCalledWith('\nRemaining entries: 7')
    })

    it('should handle no expired entries', async () => {
      mockManager.cleanup.mockReturnValue(0)
      mockManager.getStats.mockReturnValue({
        totalEntries: 5,
        totalSize: 1024000,
      })

      await handleOfflineCommand(['cleanup'])

      expect(consoleLogSpy).toHaveBeenCalledWith('No expired entries found.')
    })
  })

  describe('export command', () => {
    it('should export cache', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          entries: [{}, {}, {}],
        }),
      )

      await handleOfflineCommand(['export', 'cache.json'])

      expect(mockManager.exportCache).toHaveBeenCalledWith('cache.json', undefined)
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Exported successfully')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Entries: 3')
    })

    it('should export with filters', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          entries: [{}],
        }),
      )

      await handleOfflineCommand([
        'export',
        'filtered.json',
        '--provider',
        'claude',
        '--tags',
        'test,unit',
      ])

      expect(mockManager.exportCache).toHaveBeenCalledWith('filtered.json', {
        provider: 'claude',
        tags: ['test', 'unit'],
      })
    })

    it('should require output file', async () => {
      await expect(handleOfflineCommand(['export'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Output file required')
    })

    it('should handle export errors', async () => {
      mockManager.exportCache.mockImplementation(() => {
        throw new Error('Export failed')
      })

      await expect(handleOfflineCommand(['export', 'fail.json'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error exporting cache: Export failed')
    })
  })

  describe('import command', () => {
    it('should import cache', async () => {
      mockManager.importCache.mockReturnValue(5)
      mockManager.getStats.mockReturnValue({
        totalEntries: 5,
        totalSize: 1024000,
      })

      await handleOfflineCommand(['import', 'cache.json'])

      expect(mockManager.importCache).toHaveBeenCalledWith('cache.json', { merge: false })
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Imported 5 cache entries')
    })

    it('should import with merge option', async () => {
      mockManager.importCache.mockReturnValue(3)
      mockManager.getStats.mockReturnValue({
        totalEntries: 8,
        totalSize: 2048000,
      })

      await handleOfflineCommand(['import', 'cache.json', '--merge'])

      expect(mockManager.importCache).toHaveBeenCalledWith('cache.json', { merge: true })
      expect(consoleLogSpy).toHaveBeenCalledWith('Mode: Merge with existing cache')
    })

    it('should require input file', async () => {
      await expect(handleOfflineCommand(['import'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Input file required')
    })

    it('should handle import errors', async () => {
      mockManager.importCache.mockImplementation(() => {
        throw new Error('File not found')
      })

      await expect(handleOfflineCommand(['import', 'missing.json'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error importing cache: File not found')
    })
  })

  describe('config command', () => {
    it('should show configuration help', async () => {
      await handleOfflineCommand(['config'])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Offline Mode Configuration'),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available settings:'))
    })

    it('should set maxCacheSize', async () => {
      await handleOfflineCommand(['config', 'set', 'maxCacheSize', '1000'])

      expect(mockManager.updateConfig).toHaveBeenCalledWith({ maxCacheSize: 1000 })
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Updated maxCacheSize to 1000')
    })

    it('should set matchingStrategy', async () => {
      await handleOfflineCommand(['config', 'set', 'matchingStrategy', 'fuzzy'])

      expect(mockManager.updateConfig).toHaveBeenCalledWith({ matchingStrategy: 'fuzzy' })
    })

    it('should validate matchingStrategy values', async () => {
      await expect(
        handleOfflineCommand(['config', 'set', 'matchingStrategy', 'invalid']),
      ).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: matchingStrategy must be "exact" or "fuzzy"',
      )
    })

    it('should validate fallbackBehavior values', async () => {
      await expect(
        handleOfflineCommand(['config', 'set', 'fallbackBehavior', 'invalid']),
      ).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: fallbackBehavior must be "error", "warn", or "silent"',
      )
    })

    it('should require key and value for set', async () => {
      await expect(handleOfflineCommand(['config', 'set', 'maxCacheSize'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Key and value required')
    })

    it('should handle unknown config keys', async () => {
      await expect(handleOfflineCommand(['config', 'set', 'unknown', 'value'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Unknown configuration key: unknown')
    })

    it('should handle unknown config subcommand', async () => {
      await expect(handleOfflineCommand(['config', 'unknown'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown config command: unknown')
    })
  })

  describe('unknown command', () => {
    it('should show error for unknown command', async () => {
      await expect(handleOfflineCommand(['unknown'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown command: unknown')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Offline Mode'))
    })
  })
})
