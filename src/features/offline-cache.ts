import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { CONFIG_PATHS } from '../config/paths.js'

export interface CachedResponse {
  id: string
  prompt: string
  promptHash: string
  response: string
  provider: string
  model?: string
  timestamp: string
  context?: {
    cwd: string
    files?: string[]
    toolset?: string
  }
  metadata?: {
    tokensUsed?: number
    responseTime?: number
    temperature?: number
  }
  tags?: string[]
  expiresAt?: string
}

export interface CacheQuery {
  prompt?: string
  promptHash?: string
  provider?: string
  model?: string
  tags?: string[]
  context?: {
    cwd?: string
    files?: string[]
  }
  includeExpired?: boolean
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  providers: Record<string, number>
  oldestEntry?: string
  newestEntry?: string
  averageResponseSize: number
  hitRate?: number
}

export interface OfflineModeConfig {
  enabled: boolean
  maxCacheSize?: number // in MB
  maxEntries?: number
  expirationDays?: number
  autoCleanup?: boolean
  fallbackBehavior?: 'error' | 'warn' | 'silent'
  matchingStrategy?: 'exact' | 'fuzzy' | 'semantic'
  cacheProbability?: number // 0-1, for partial caching
}

export class OfflineCacheManager {
  private cacheDir: string
  private indexFile: string
  private index: Map<string, CachedResponse> = new Map()
  private config: OfflineModeConfig
  private stats: {
    hits: number
    misses: number
    saves: number
  } = { hits: 0, misses: 0, saves: 0 }

  constructor(config: Partial<OfflineModeConfig> = {}) {
    this.config = {
      enabled: true,
      maxCacheSize: 500, // 500 MB default
      maxEntries: 10000,
      expirationDays: 30,
      autoCleanup: true,
      fallbackBehavior: 'warn',
      matchingStrategy: 'exact',
      cacheProbability: 1.0,
      ...config,
    }

    this.cacheDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'offline-cache')
    this.indexFile = path.join(this.cacheDir, 'index.json')

    this.ensureCacheDirectory()
    this.loadIndex()

    if (this.config.autoCleanup) {
      this.cleanup()
    }
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  private loadIndex(): void {
    if (fs.existsSync(this.indexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'))
        this.index = new Map(Object.entries(data))
      } catch (error) {
        console.warn('Failed to load cache index, starting fresh:', error.message)
        this.index = new Map()
      }
    }
  }

  private saveIndex(): void {
    const data = Object.fromEntries(this.index)
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2))
  }

  /**
   * Generate a hash for a prompt
   */
  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex')
  }

  /**
   * Generate a unique cache entry ID
   */
  private generateId(): string {
    return `cache-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Enable/disable offline mode
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  /**
   * Save a response to cache
   */
  async saveResponse(
    prompt: string,
    response: string,
    provider: string,
    options: {
      model?: string
      context?: CachedResponse['context']
      metadata?: CachedResponse['metadata']
      tags?: string[]
      ttlDays?: number
    } = {},
  ): Promise<CachedResponse | null> {
    if (!this.config.enabled) {
      return null
    }

    // Check cache probability
    if (this.config.cacheProbability < 1 && Math.random() > this.config.cacheProbability) {
      return null
    }

    // Check size limits
    if (this.index.size >= this.config.maxEntries!) {
      this.evictOldest()
    }

    const promptHash = this.hashPrompt(prompt)
    const id = this.generateId()
    const ttlDays = options.ttlDays ?? this.config.expirationDays!

    const entry: CachedResponse = {
      id,
      prompt,
      promptHash,
      response,
      provider,
      model: options.model,
      timestamp: new Date().toISOString(),
      context: options.context,
      metadata: options.metadata,
      tags: options.tags,
      expiresAt:
        ttlDays !== 0
          ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
    }

    // Save response to file
    const responseFile = path.join(this.cacheDir, `${id}.json`)
    fs.writeFileSync(responseFile, JSON.stringify(entry, null, 2))

    // Update index
    this.index.set(id, entry)
    this.saveIndex()
    this.stats.saves++

    return entry
  }

  /**
   * Find a cached response
   */
  async findResponse(query: CacheQuery): Promise<CachedResponse | null> {
    if (!this.config.enabled) {
      return null
    }

    let matches: CachedResponse[] = []

    // Filter by various criteria
    for (const entry of this.index.values()) {
      let shouldInclude = true

      // Check expiration
      if (!query.includeExpired && entry.expiresAt) {
        if (new Date(entry.expiresAt) < new Date()) {
          continue
        }
      }

      // Match by hash (exact match)
      if (query.promptHash) {
        if (entry.promptHash === query.promptHash) {
          matches.push(entry)
          continue
        } else {
          shouldInclude = false
        }
      }

      // Match by prompt
      if (query.prompt) {
        if (this.config.matchingStrategy === 'exact') {
          if (entry.prompt !== query.prompt) {
            shouldInclude = false
          }
        } else if (this.config.matchingStrategy === 'fuzzy') {
          if (!this.fuzzyMatch(entry.prompt, query.prompt)) {
            shouldInclude = false
          }
        }
        // Semantic matching would require embeddings - not implemented
      }

      // Filter by provider
      if (query.provider && entry.provider !== query.provider) {
        shouldInclude = false
      }

      // Filter by model
      if (query.model && entry.model !== query.model) {
        shouldInclude = false
      }

      // Filter by tags
      if (query.tags && query.tags.length > 0) {
        if (!entry.tags || !query.tags.every((tag) => entry.tags!.includes(tag))) {
          shouldInclude = false
        }
      }

      // Filter by context
      if (query.context) {
        if (query.context.cwd && entry.context?.cwd !== query.context.cwd) {
          shouldInclude = false
        }
        if (query.context.files && entry.context?.files) {
          const hasAllFiles = query.context.files.every((file) =>
            entry.context!.files!.includes(file),
          )
          if (!hasAllFiles) {
            shouldInclude = false
          }
        }
      }

      if (shouldInclude) {
        matches.push(entry)
      }
    }

    if (matches.length === 0) {
      this.stats.misses++
      return null
    }

    // Sort by timestamp (newest first)
    matches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    this.stats.hits++
    return matches[0]
  }

  /**
   * Get a cached response by exact prompt match
   */
  async getCachedResponse(prompt: string, provider?: string): Promise<CachedResponse | null> {
    const promptHash = this.hashPrompt(prompt)
    return this.findResponse({ promptHash, provider })
  }

  /**
   * Search cache with fuzzy matching
   */
  async searchCache(query: string, limit: number = 10): Promise<CachedResponse[]> {
    const results: Array<{ entry: CachedResponse; score: number }> = []

    for (const entry of this.index.values()) {
      // Skip expired entries
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
        continue
      }

      const score = this.calculateSimilarity(query, entry.prompt)
      if (score > 0.2) {
        // Lowered threshold for relevance
        results.push({ entry, score })
      }
    }

    // Sort by score and return top matches
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.entry)
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0
    const providers: Record<string, number> = {}
    let oldestEntry: string | undefined
    let newestEntry: string | undefined
    let oldestTime = Infinity
    let newestTime = 0

    for (const entry of this.index.values()) {
      // Estimate size
      totalSize += JSON.stringify(entry).length

      // Count by provider
      providers[entry.provider] = (providers[entry.provider] || 0) + 1

      // Track oldest/newest
      const timestamp = new Date(entry.timestamp).getTime()
      if (timestamp < oldestTime) {
        oldestTime = timestamp
        oldestEntry = entry.timestamp
      }
      if (timestamp > newestTime) {
        newestTime = timestamp
        newestEntry = entry.timestamp
      }
    }

    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0

    return {
      totalEntries: this.index.size,
      totalSize,
      providers,
      oldestEntry,
      newestEntry,
      averageResponseSize: this.index.size > 0 ? totalSize / this.index.size : 0,
      hitRate,
    }
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    // Delete all cache files
    for (const entry of this.index.values()) {
      const filePath = path.join(this.cacheDir, `${entry.id}.json`)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    // Clear index
    this.index.clear()
    this.saveIndex()

    // Reset stats
    this.stats = { hits: 0, misses: 0, saves: 0 }
  }

  /**
   * Delete a specific cache entry
   */
  deleteEntry(id: string): boolean {
    const entry = this.index.get(id)
    if (!entry) {
      return false
    }

    // Delete file
    const filePath = path.join(this.cacheDir, `${id}.json`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Remove from index
    this.index.delete(id)
    this.saveIndex()

    return true
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let deletedCount = 0
    const now = new Date()

    for (const [id, entry] of this.index.entries()) {
      if (entry.expiresAt && new Date(entry.expiresAt) < now) {
        this.deleteEntry(id)
        deletedCount++
      }
    }

    // Also check cache size limit
    const stats = this.getStats()
    if (stats.totalSize > this.config.maxCacheSize! * 1024 * 1024) {
      // Evict oldest entries until under limit
      const sortedEntries = Array.from(this.index.entries()).sort(
        (a, b) => new Date(a[1].timestamp).getTime() - new Date(b[1].timestamp).getTime(),
      )

      let currentSize = stats.totalSize
      for (const [id, entry] of sortedEntries) {
        if (currentSize <= this.config.maxCacheSize! * 1024 * 1024) {
          break
        }

        const entrySize = JSON.stringify(entry).length
        this.deleteEntry(id)
        currentSize -= entrySize
        deletedCount++
      }
    }

    return deletedCount
  }

  /**
   * Export cache entries
   */
  exportCache(outputPath: string, filter?: CacheQuery): void {
    let entries = Array.from(this.index.values())

    // Apply filter if provided
    if (filter) {
      const filtered: CachedResponse[] = []
      for (const entry of entries) {
        const result = this.matchesQuery(entry, filter)
        if (result) {
          filtered.push(entry)
        }
      }
      entries = filtered
    }

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      entries,
      stats: this.getStats(),
    }

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2))
  }

  /**
   * Import cache entries
   */
  importCache(inputPath: string, options: { merge?: boolean } = {}): number {
    if (!fs.existsSync(inputPath)) {
      throw new Error('Import file not found')
    }

    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

    if (!options.merge) {
      this.clearCache()
    }

    let importedCount = 0
    for (const entry of data.entries) {
      // Generate new ID to avoid conflicts
      const newId = this.generateId()
      const newEntry = { ...entry, id: newId }

      // Save to file
      const filePath = path.join(this.cacheDir, `${newId}.json`)
      fs.writeFileSync(filePath, JSON.stringify(newEntry, null, 2))

      // Add to index
      this.index.set(newId, newEntry)
      importedCount++
    }

    this.saveIndex()
    return importedCount
  }

  /**
   * Tag cache entries
   */
  addTags(id: string, tags: string[]): boolean {
    const entry = this.index.get(id)
    if (!entry) {
      return false
    }

    entry.tags = [...new Set([...(entry.tags || []), ...tags])]

    // Update file
    const filePath = path.join(this.cacheDir, `${id}.json`)
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2))

    // Update index
    this.index.set(id, entry)
    this.saveIndex()

    return true
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<OfflineModeConfig>): void {
    const oldAutoCleanup = this.config.autoCleanup
    this.config = { ...this.config, ...config }

    if (config.autoCleanup && !oldAutoCleanup) {
      this.cleanup()
    }
  }

  private fuzzyMatch(str1: string, str2: string): boolean {
    // Simple fuzzy matching - could be improved with better algorithms
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
    const n1 = normalize(str1)
    const n2 = normalize(str2)

    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) {
      return true
    }

    // Check similarity
    return this.calculateSimilarity(str1, str2) > 0.8
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Jaccard similarity on words
    const words1 = new Set(str1.toLowerCase().split(/\s+/))
    const words2 = new Set(str2.toLowerCase().split(/\s+/))

    const intersection = new Set([...words1].filter((x) => words2.has(x)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  private matchesQuery(entry: CachedResponse, query: CacheQuery): boolean {
    // Similar logic to findResponse but returns boolean
    if (!query.includeExpired && entry.expiresAt) {
      if (new Date(entry.expiresAt) < new Date()) {
        return false
      }
    }

    if (query.promptHash && entry.promptHash !== query.promptHash) {
      return false
    }

    if (query.provider && entry.provider !== query.provider) {
      return false
    }

    if (query.model && entry.model !== query.model) {
      return false
    }

    if (query.tags && query.tags.length > 0) {
      if (!entry.tags || !query.tags.every((tag) => entry.tags!.includes(tag))) {
        return false
      }
    }

    return true
  }

  private evictOldest(): void {
    // Find oldest entry
    let oldestId: string | undefined
    let oldestTime = Infinity

    for (const [id, entry] of this.index.entries()) {
      const time = new Date(entry.timestamp).getTime()
      if (time < oldestTime) {
        oldestTime = time
        oldestId = id
      }
    }

    if (oldestId) {
      this.deleteEntry(oldestId)
    }
  }

  /**
   * Create a response interceptor for the AI provider
   */
  createInterceptor() {
    return {
      beforeRequest: async (prompt: string, provider: string) => {
        if (!this.config.enabled) {
          return null
        }

        const cached = await this.getCachedResponse(prompt, provider)
        if (cached) {
          if (this.config.fallbackBehavior === 'warn') {
            console.log('\n📦 Using cached response (offline mode)')
          }
          return cached.response
        }

        return null
      },

      afterResponse: async (prompt: string, response: string, provider: string, metadata?: any) => {
        await this.saveResponse(prompt, response, provider, {
          model: metadata?.model,
          metadata: {
            tokensUsed: metadata?.tokensUsed,
            responseTime: metadata?.responseTime,
            temperature: metadata?.temperature,
          },
          context: {
            cwd: process.cwd(),
            files: metadata?.files,
          },
        })
      },
    }
  }
}
