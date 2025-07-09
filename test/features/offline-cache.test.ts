import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { OfflineCacheManager } from '../../src/features/offline-cache.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')

describe('OfflineCacheManager', () => {
  let cacheManager: OfflineCacheManager
  const mockConfigDir = '/test/.coda'
  const mockCacheDir = '/test/.coda/offline-cache'
  const mockIndexFile = '/test/.coda/offline-cache/index.json'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

    cacheManager = new OfflineCacheManager()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create cache directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockCacheDir, { recursive: true })
    })

    it('should load existing index', () => {
      const mockIndex = {
        'cache-123': {
          id: 'cache-123',
          prompt: 'test prompt',
          response: 'test response',
          provider: 'test-provider',
          timestamp: new Date().toISOString(),
        },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockIndex))

      const manager = new OfflineCacheManager()
      const stats = manager.getStats()

      expect(stats.totalEntries).toBe(1)
    })

    it('should handle corrupted index gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      new OfflineCacheManager()

      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('should respect configuration options', () => {
      const config = {
        enabled: false,
        maxCacheSize: 100,
        expirationDays: 7,
      }

      const manager = new OfflineCacheManager(config)
      expect(manager.isEnabled()).toBe(false)
    })
  })

  describe('saveResponse', () => {
    it('should save a response to cache', async () => {
      const prompt = 'What is 2+2?'
      const response = 'The answer is 4.'
      const provider = 'test-provider'

      const result = await cacheManager.saveResponse(prompt, response, provider, {
        model: 'test-model',
        tags: ['math', 'simple'],
      })

      expect(result).toBeDefined()
      expect(result?.prompt).toBe(prompt)
      expect(result?.response).toBe(response)
      expect(result?.provider).toBe(provider)
      expect(result?.model).toBe('test-model')
      expect(result?.tags).toEqual(['math', 'simple'])

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2) // Entry file + index
    })

    it('should respect cache probability', async () => {
      const manager = new OfflineCacheManager({ cacheProbability: 0 })

      const result = await manager.saveResponse('prompt', 'response', 'provider')

      expect(result).toBeNull()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should handle expiration', async () => {
      const result = await cacheManager.saveResponse('prompt', 'response', 'provider', {
        ttlDays: 7,
      })

      expect(result?.expiresAt).toBeDefined()
      const expiresAt = new Date(result!.expiresAt!)
      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      // Allow 1 second tolerance
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })

    it('should evict oldest when max entries reached', async () => {
      const manager = new OfflineCacheManager({ maxEntries: 2 })

      // Mock existing entries
      const mockIndex = {
        'old-entry': {
          id: 'old-entry',
          prompt: 'old',
          response: 'old',
          provider: 'test',
          timestamp: new Date(Date.now() - 10000).toISOString(),
        },
        'newer-entry': {
          id: 'newer-entry',
          prompt: 'newer',
          response: 'newer',
          provider: 'test',
          timestamp: new Date(Date.now() - 5000).toISOString(),
        },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === mockIndexFile) {
          return JSON.stringify(mockIndex)
        }
        return '{}'
      })

      const newManager = new OfflineCacheManager({ maxEntries: 2 })

      await newManager.saveResponse('new prompt', 'new response', 'test')

      expect(fs.unlinkSync).toHaveBeenCalled()
    })

    it('should not save when disabled', async () => {
      cacheManager.setEnabled(false)

      const result = await cacheManager.saveResponse('prompt', 'response', 'provider')

      expect(result).toBeNull()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe('findResponse', () => {
    beforeEach(async () => {
      // Pre-populate cache
      await cacheManager.saveResponse('What is 2+2?', '4', 'claude', {
        model: 'claude-3',
        tags: ['math'],
      })

      await cacheManager.saveResponse('What is AI?', 'Artificial Intelligence...', 'gemini', {
        model: 'gemini-pro',
        tags: ['ai', 'definition'],
      })
    })

    it('should find response by exact prompt hash', async () => {
      const promptHash = crypto.createHash('sha256').update('What is 2+2?').digest('hex')

      const result = await cacheManager.findResponse({ promptHash })

      expect(result).toBeDefined()
      expect(result?.prompt).toBe('What is 2+2?')
    })

    it('should find response by exact prompt match', async () => {
      const result = await cacheManager.findResponse({
        prompt: 'What is 2+2?',
      })

      expect(result).toBeDefined()
      expect(result?.response).toBe('4')
    })

    it('should filter by provider', async () => {
      const result = await cacheManager.findResponse({
        prompt: 'What is AI?',
        provider: 'gemini',
      })

      expect(result).toBeDefined()
      expect(result?.provider).toBe('gemini')
    })

    it('should filter by tags', async () => {
      const result = await cacheManager.findResponse({
        tags: ['math'],
      })

      expect(result).toBeDefined()
      expect(result?.prompt).toBe('What is 2+2?')
    })

    it('should exclude expired entries by default', async () => {
      // Add expired entry
      await cacheManager.saveResponse('Expired prompt', 'Expired response', 'test', {
        ttlDays: -1, // Expired
      })

      const result = await cacheManager.findResponse({
        prompt: 'Expired prompt',
      })

      expect(result).toBeNull()
    })

    it('should include expired entries when requested', async () => {
      // Add expired entry
      await cacheManager.saveResponse('Expired prompt', 'Expired response', 'test', {
        ttlDays: -1, // Expired
      })

      const result = await cacheManager.findResponse({
        prompt: 'Expired prompt',
        includeExpired: true,
      })

      expect(result).toBeDefined()
    })

    it('should return null when no match found', async () => {
      const result = await cacheManager.findResponse({
        prompt: 'Non-existent prompt',
      })

      expect(result).toBeNull()
    })

    it('should track cache hits and misses', async () => {
      await cacheManager.findResponse({ prompt: 'What is 2+2?' }) // Hit
      await cacheManager.findResponse({ prompt: 'Unknown' }) // Miss

      const stats = cacheManager.getStats()
      expect(stats.hitRate).toBeGreaterThan(0)
    })
  })

  describe('getCachedResponse', () => {
    it('should get response by exact prompt', async () => {
      await cacheManager.saveResponse('Test prompt', 'Test response', 'provider')

      const result = await cacheManager.getCachedResponse('Test prompt')

      expect(result).toBeDefined()
      expect(result?.response).toBe('Test response')
    })

    it('should filter by provider', async () => {
      await cacheManager.saveResponse('Same prompt', 'Response 1', 'provider1')
      await cacheManager.saveResponse('Same prompt', 'Response 2', 'provider2')

      const result = await cacheManager.getCachedResponse('Same prompt', 'provider2')

      expect(result).toBeDefined()
      expect(result?.provider).toBe('provider2')
      expect(result?.response).toBe('Response 2')
    })
  })

  describe('searchCache', () => {
    beforeEach(async () => {
      await cacheManager.saveResponse('How to write unit tests?', 'Testing guide...', 'claude')
      await cacheManager.saveResponse('What are unit tests?', 'Unit tests are...', 'claude')
      await cacheManager.saveResponse('Testing best practices', 'Best practices...', 'claude')
    })

    it('should search with fuzzy matching', async () => {
      const results = await cacheManager.searchCache('unit test')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some((r) => r.prompt.includes('unit test'))).toBe(true)
    })

    it('should limit results', async () => {
      const results = await cacheManager.searchCache('test', 2)

      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should exclude expired entries', async () => {
      await cacheManager.saveResponse('Expired test', 'Expired', 'test', {
        ttlDays: -1,
      })

      const results = await cacheManager.searchCache('test')

      expect(results.every((r) => r.prompt !== 'Expired test')).toBe(true)
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await cacheManager.saveResponse('Prompt 1', 'Response 1', 'claude')
      await cacheManager.saveResponse('Prompt 2', 'Response 2', 'gemini')

      const stats = cacheManager.getStats()

      expect(stats.totalEntries).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.providers).toEqual({
        claude: 1,
        gemini: 1,
      })
      expect(stats.averageResponseSize).toBeGreaterThan(0)
    })

    it('should handle empty cache', () => {
      const stats = cacheManager.getStats()

      expect(stats.totalEntries).toBe(0)
      expect(stats.totalSize).toBe(0)
      expect(stats.providers).toEqual({})
      expect(stats.averageResponseSize).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('should clear all cache entries', async () => {
      await cacheManager.saveResponse('Test 1', 'Response 1', 'provider')
      await cacheManager.saveResponse('Test 2', 'Response 2', 'provider')

      // Mock existsSync to return true for cache files
      vi.mocked(fs.existsSync).mockReturnValue(true)

      cacheManager.clearCache()

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(0)
      expect(fs.unlinkSync).toHaveBeenCalled()
    })
  })

  describe('deleteEntry', () => {
    it('should delete specific entry', async () => {
      const result = await cacheManager.saveResponse('To delete', 'Response', 'provider')

      // Mock existsSync to return true for the file we're deleting
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const deleted = cacheManager.deleteEntry(result!.id)

      expect(deleted).toBe(true)
      expect(fs.unlinkSync).toHaveBeenCalled()

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(0)
    })

    it('should return false for non-existent entry', () => {
      const deleted = cacheManager.deleteEntry('non-existent')
      expect(deleted).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      // Add expired entry
      await cacheManager.saveResponse('Expired', 'Response', 'provider', {
        ttlDays: -1,
      })

      // Add valid entry
      await cacheManager.saveResponse('Valid', 'Response', 'provider', {
        ttlDays: 7,
      })

      // Mock existsSync to return true for cleanup
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const deletedCount = cacheManager.cleanup()

      expect(deletedCount).toBe(1)

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    it('should respect size limits', async () => {
      const manager = new OfflineCacheManager({
        maxCacheSize: 0.0001, // Very small, in MB
      })

      await manager.saveResponse('Large prompt', 'Large response'.repeat(1000), 'provider')

      const deletedCount = manager.cleanup()

      expect(deletedCount).toBeGreaterThan(0)
    })
  })

  describe('exportCache', () => {
    it('should export all cache entries', async () => {
      await cacheManager.saveResponse('Export 1', 'Response 1', 'provider')
      await cacheManager.saveResponse('Export 2', 'Response 2', 'provider')

      cacheManager.exportCache('/test/export.json')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/test/export.json')

      expect(writeCall).toBeDefined()
      const exported = JSON.parse(writeCall![1] as string)

      expect(exported.version).toBe('1.0')
      expect(exported.entries).toHaveLength(2)
      expect(exported.stats).toBeDefined()
    })

    it('should apply filters when exporting', async () => {
      await cacheManager.saveResponse('Claude prompt', 'Response', 'claude')
      await cacheManager.saveResponse('Gemini prompt', 'Response', 'gemini')

      cacheManager.exportCache('/test/filtered.json', { provider: 'claude' })

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/test/filtered.json')

      const exported = JSON.parse(writeCall![1] as string)
      expect(exported.entries).toHaveLength(1)
      expect(exported.entries[0].provider).toBe('claude')
    })
  })

  describe('importCache', () => {
    it('should import cache entries', () => {
      const importData = {
        version: '1.0',
        entries: [
          {
            id: 'old-id',
            prompt: 'Imported prompt',
            response: 'Imported response',
            provider: 'imported',
            timestamp: new Date().toISOString(),
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importData))

      const count = cacheManager.importCache('/test/import.json')

      expect(count).toBe(1)

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(1)
    })

    it('should merge with existing cache', async () => {
      await cacheManager.saveResponse('Existing', 'Response', 'provider')

      const importData = {
        version: '1.0',
        entries: [
          {
            id: 'imported',
            prompt: 'New',
            response: 'New response',
            provider: 'provider',
            timestamp: new Date().toISOString(),
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('import.json')) {
          return JSON.stringify(importData)
        }
        return '{}'
      })

      cacheManager.importCache('/test/import.json', { merge: true })

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2)
    })

    it('should throw error if file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => cacheManager.importCache('/missing.json')).toThrow('Import file not found')
    })
  })

  describe('addTags', () => {
    it('should add tags to entry', async () => {
      const result = await cacheManager.saveResponse('Test', 'Response', 'provider', {
        tags: ['original'],
      })

      const success = cacheManager.addTags(result!.id, ['new', 'tags'])

      expect(success).toBe(true)

      const updated = await cacheManager.findResponse({ tags: ['new'] })
      expect(updated?.tags).toContain('new')
      expect(updated?.tags).toContain('original')
    })

    it('should return false for non-existent entry', () => {
      const success = cacheManager.addTags('non-existent', ['tag'])
      expect(success).toBe(false)
    })
  })

  describe('updateConfig', () => {
    it('should update configuration', () => {
      cacheManager.updateConfig({ enabled: false })

      expect(cacheManager.isEnabled()).toBe(false)
    })

    it('should trigger cleanup when enabling auto-cleanup', () => {
      const manager = new OfflineCacheManager({ autoCleanup: false })

      const cleanupSpy = vi.spyOn(manager, 'cleanup')

      manager.updateConfig({ autoCleanup: true })

      expect(cleanupSpy).toHaveBeenCalled()
    })
  })

  describe('createInterceptor', () => {
    it('should create request/response interceptor', async () => {
      await cacheManager.saveResponse('Cached prompt', 'Cached response', 'provider')

      const interceptor = cacheManager.createInterceptor()

      // Test beforeRequest
      const cachedResult = await interceptor.beforeRequest('Cached prompt', 'provider')
      expect(cachedResult).toBe('Cached response')

      // Test afterResponse
      await interceptor.afterResponse('New prompt', 'New response', 'provider', {
        model: 'test-model',
        tokensUsed: 100,
      })

      const stats = cacheManager.getStats()
      expect(stats.totalEntries).toBe(2)
    })

    it('should respect offline mode setting', async () => {
      cacheManager.setEnabled(false)

      const interceptor = cacheManager.createInterceptor()
      const result = await interceptor.beforeRequest('Any prompt', 'provider')

      expect(result).toBeNull()
    })

    it('should show warning when using cached response', async () => {
      await cacheManager.saveResponse('Test', 'Cached', 'provider')

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const interceptor = cacheManager.createInterceptor()
      await interceptor.beforeRequest('Test', 'provider')

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Using cached response'))

      logSpy.mockRestore()
    })
  })

  describe('fuzzy matching', () => {
    beforeEach(() => {
      cacheManager = new OfflineCacheManager({ matchingStrategy: 'fuzzy' })
    })

    it('should find similar prompts', async () => {
      await cacheManager.saveResponse('How do I write unit tests?', 'Testing guide', 'provider')

      const result = await cacheManager.findResponse({
        prompt: 'How do I write unit tests', // Slightly different (no question mark)
      })

      expect(result).toBeDefined()
      expect(result?.response).toBe('Testing guide')
    })

    it('should handle case differences', async () => {
      await cacheManager.saveResponse('What is TypeScript?', 'TypeScript is...', 'provider')

      const result = await cacheManager.findResponse({
        prompt: 'what is typescript?', // Different case
      })

      expect(result).toBeDefined()
    })
  })
})
