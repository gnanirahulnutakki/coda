import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { CONFIG_PATHS } from '../config/paths.js'

export interface DocumentChunk {
  id: string
  content: string
  metadata: {
    file: string
    section?: string
    lineStart: number
    lineEnd: number
    lastModified: number
    fileHash: string
  }
  embedding?: number[]
}

export interface DocumentIndex {
  projectId: string
  projectPath: string
  lastUpdated: string
  chunks: DocumentChunk[]
  files: {
    [filePath: string]: {
      hash: string
      lastModified: number
      chunkCount: number
    }
  }
}

export interface SearchResult {
  chunk: DocumentChunk
  score: number
  context: {
    before?: string
    after?: string
  }
}

export class DocumentationIndexer {
  private indexDir: string
  private projectId: string
  private currentProject: string
  private index: DocumentIndex | null = null

  // Common documentation file patterns
  private readonly docPatterns = [
    '**/*.md',
    '**/*.rst',
    '**/*.txt',
    '**/README*',
    '**/CHANGELOG*',
    '**/CONTRIBUTING*',
    '**/LICENSE*',
    '**/docs/**/*',
    '**/documentation/**/*',
    '**/*.adoc',
    '**/*.org',
  ]

  // Files to exclude
  private readonly excludePatterns = [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    'target/**',
    '.next/**',
    '.nuxt/**',
    'coverage/**',
    '**/*.min.*',
    '**/.DS_Store',
  ]

  constructor() {
    const configDir = CONFIG_PATHS.getConfigDirectory()
    this.indexDir = path.join(configDir, 'doc-index')
    this.ensureIndexDirectory()
  }

  private ensureIndexDirectory(): void {
    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true })
    }
  }

  async initializeProject(projectPath: string): Promise<void> {
    this.currentProject = projectPath
    this.projectId = Buffer.from(projectPath).toString('base64').replace(/[/+=]/g, '')
    await this.loadIndex()
  }

  private getIndexPath(): string {
    if (!this.projectId) {
      throw new Error('No project initialized')
    }
    return path.join(this.indexDir, `${this.projectId}.json`)
  }

  private async loadIndex(): Promise<void> {
    const indexPath = this.getIndexPath()

    if (!fs.existsSync(indexPath)) {
      this.index = {
        projectId: this.projectId,
        projectPath: this.currentProject,
        lastUpdated: new Date().toISOString(),
        chunks: [],
        files: {},
      }
      return
    }

    try {
      const data = fs.readFileSync(indexPath, 'utf8')
      this.index = JSON.parse(data)
    } catch (error) {
      console.warn('Failed to load documentation index, starting fresh:', error.message)
      this.index = {
        projectId: this.projectId,
        projectPath: this.currentProject,
        lastUpdated: new Date().toISOString(),
        chunks: [],
        files: {},
      }
    }
  }

  private saveIndex(): void {
    if (!this.index) return

    const indexPath = this.getIndexPath()
    this.index.lastUpdated = new Date().toISOString()
    fs.writeFileSync(indexPath, JSON.stringify(this.index, null, 2))
  }

  private calculateFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      return crypto.createHash('md5').update(content).digest('hex')
    } catch (error) {
      return ''
    }
  }

  private matchesPattern(filePath: string, patterns: string[]): boolean {
    const relativePath = path.relative(this.currentProject, filePath)

    return patterns.some((pattern) => {
      // Simple pattern matching (supports * and **)
      const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      const regex = new RegExp(`^${regexPattern}$`, 'i')
      return regex.test(relativePath)
    })
  }

  private shouldIndexFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false

    const stats = fs.statSync(filePath)
    if (!stats.isFile()) return false

    // Check if file matches exclusion patterns
    if (this.matchesPattern(filePath, this.excludePatterns)) {
      return false
    }

    // Check if file matches documentation patterns
    return this.matchesPattern(filePath, this.docPatterns)
  }

  private chunkContent(
    content: string,
    filePath: string,
    fileHash: string,
    lastModified: number,
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = []
    const lines = content.split('\n')
    const chunkSize = 500 // characters per chunk
    const overlapSize = 50 // overlap between chunks

    let currentChunk = ''
    let lineStart = 1
    let chunkId = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineWithNewline = line + '\n'

      // Check if adding this line would exceed chunk size
      if (currentChunk.length + lineWithNewline.length > chunkSize && currentChunk.length > 0) {
        // Create chunk
        const chunk: DocumentChunk = {
          id: `${fileHash}-${chunkId++}`,
          content: currentChunk.trim(),
          metadata: {
            file: path.relative(this.currentProject, filePath),
            lineStart,
            lineEnd: i,
            lastModified,
            fileHash,
          },
        }
        chunks.push(chunk)

        // Start new chunk with overlap
        const overlapLines = lines.slice(Math.max(0, i - 3), i + 1)
        currentChunk = overlapLines.join('\n') + '\n'
        lineStart = Math.max(1, i - 2)
      } else {
        currentChunk += lineWithNewline
      }
    }

    // Add final chunk if there's content
    if (currentChunk.trim().length > 0) {
      const chunk: DocumentChunk = {
        id: `${fileHash}-${chunkId}`,
        content: currentChunk.trim(),
        metadata: {
          file: path.relative(this.currentProject, filePath),
          lineStart,
          lineEnd: lines.length,
          lastModified,
          fileHash,
        },
      }
      chunks.push(chunk)
    }

    return chunks
  }

  private async findDocumentationFiles(): Promise<string[]> {
    const files: string[] = []

    const scanDirectory = (dir: string): void => {
      if (!fs.existsSync(dir)) return

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          if (entry.isDirectory()) {
            // Skip excluded directories
            if (!this.matchesPattern(fullPath, this.excludePatterns)) {
              scanDirectory(fullPath)
            }
          } else if (entry.isFile()) {
            if (this.shouldIndexFile(fullPath)) {
              files.push(fullPath)
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    scanDirectory(this.currentProject)
    return files
  }

  async indexDocumentation(
    options: { force?: boolean; files?: string[] } = {},
  ): Promise<{ indexed: number; updated: number; errors: number }> {
    if (!this.index) {
      throw new Error('No project initialized')
    }

    const filesToIndex = options.files || (await this.findDocumentationFiles())
    let indexed = 0
    let updated = 0
    let errors = 0

    for (const filePath of filesToIndex) {
      try {
        const stats = fs.statSync(filePath)
        const currentHash = this.calculateFileHash(filePath)
        const relativePath = path.relative(this.currentProject, filePath)

        const existingFile = this.index.files[relativePath]

        // Skip if file hasn't changed (unless forced)
        if (!options.force && existingFile && existingFile.hash === currentHash) {
          continue
        }

        // Remove old chunks for this file
        this.index.chunks = this.index.chunks.filter(
          (chunk) => chunk.metadata.file !== relativePath,
        )

        // Read and chunk the file
        const content = fs.readFileSync(filePath, 'utf8')
        const chunks = this.chunkContent(content, filePath, currentHash, stats.mtime.getTime())

        // Add new chunks
        this.index.chunks.push(...chunks)

        // Update file metadata
        this.index.files[relativePath] = {
          hash: currentHash,
          lastModified: stats.mtime.getTime(),
          chunkCount: chunks.length,
        }

        if (existingFile) {
          updated++
        } else {
          indexed++
        }
      } catch (error) {
        console.warn(`Failed to index ${filePath}:`, error.message)
        errors++
      }
    }

    this.saveIndex()
    return { indexed, updated, errors }
  }

  private calculateSimilarity(query: string, content: string): number {
    // Simple keyword-based similarity (in real implementation, use embeddings)
    const queryWords = query.toLowerCase().split(/\s+/)
    const contentWords = content.toLowerCase().split(/\s+/)

    const querySet = new Set(queryWords)
    const contentSet = new Set(contentWords)

    // Calculate Jaccard similarity
    const intersection = new Set([...querySet].filter((x) => contentSet.has(x)))
    const union = new Set([...querySet, ...contentSet])

    const jaccardSimilarity = intersection.size / union.size

    // Boost exact phrase matches
    const phraseBoost = content.toLowerCase().includes(query.toLowerCase()) ? 0.3 : 0

    // Boost based on query word frequency
    let frequencyScore = 0
    for (const word of queryWords) {
      const regex = new RegExp(word, 'gi')
      const matches = content.match(regex)
      frequencyScore += matches ? matches.length / contentWords.length : 0
    }

    return Math.min(1, jaccardSimilarity + phraseBoost + frequencyScore * 0.1)
  }

  search(query: string, options: { limit?: number; threshold?: number } = {}): SearchResult[] {
    if (!this.index) {
      throw new Error('No project initialized')
    }

    const { limit = 10, threshold = 0.1 } = options
    const results: SearchResult[] = []

    for (const chunk of this.index.chunks) {
      const score = this.calculateSimilarity(query, chunk.content)

      if (score >= threshold) {
        results.push({
          chunk,
          score,
          context: this.getContext(chunk),
        })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit)
  }

  private getContext(chunk: DocumentChunk): { before?: string; after?: string } {
    if (!this.index) return {}

    const filePath = path.join(this.currentProject, chunk.metadata.file)
    if (!fs.existsSync(filePath)) return {}

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n')

      const contextLines = 2
      const before = lines
        .slice(
          Math.max(0, chunk.metadata.lineStart - contextLines - 1),
          chunk.metadata.lineStart - 1,
        )
        .join('\n')

      const after = lines
        .slice(chunk.metadata.lineEnd, chunk.metadata.lineEnd + contextLines)
        .join('\n')

      return {
        before: before || undefined,
        after: after || undefined,
      }
    } catch (error) {
      return {}
    }
  }

  getIndexStats(): {
    totalChunks: number
    totalFiles: number
    lastUpdated: string
    filesByType: { [ext: string]: number }
    largestFiles: Array<{ file: string; chunks: number }>
  } {
    if (!this.index) {
      throw new Error('No project initialized')
    }

    const filesByType: { [ext: string]: number } = {}
    const fileChunkCounts: Array<{ file: string; chunks: number }> = []

    for (const [filePath, fileInfo] of Object.entries(this.index.files)) {
      const ext = path.extname(filePath) || 'no extension'
      filesByType[ext] = (filesByType[ext] || 0) + 1
      fileChunkCounts.push({ file: filePath, chunks: fileInfo.chunkCount })
    }

    fileChunkCounts.sort((a, b) => b.chunks - a.chunks)

    return {
      totalChunks: this.index.chunks.length,
      totalFiles: Object.keys(this.index.files).length,
      lastUpdated: this.index.lastUpdated,
      filesByType,
      largestFiles: fileChunkCounts.slice(0, 10),
    }
  }

  async rebuildIndex(): Promise<{ indexed: number; updated: number; errors: number }> {
    if (!this.index) {
      throw new Error('No project initialized')
    }

    // Clear existing index
    this.index.chunks = []
    this.index.files = {}

    return this.indexDocumentation({ force: true })
  }

  removeFile(filePath: string): boolean {
    if (!this.index) return false

    const relativePath = path.relative(this.currentProject, filePath)

    if (!this.index.files[relativePath]) {
      return false
    }

    // Remove chunks for this file
    const initialChunkCount = this.index.chunks.length
    this.index.chunks = this.index.chunks.filter((chunk) => chunk.metadata.file !== relativePath)

    // Remove file metadata
    delete this.index.files[relativePath]

    this.saveIndex()
    return this.index.chunks.length < initialChunkCount
  }

  async exportIndex(outputPath: string): Promise<void> {
    if (!this.index) {
      throw new Error('No project initialized')
    }

    fs.writeFileSync(outputPath, JSON.stringify(this.index, null, 2))
  }

  async importIndex(inputPath: string): Promise<void> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Import file not found: ${inputPath}`)
    }

    const data = fs.readFileSync(inputPath, 'utf8')
    const importedIndex: DocumentIndex = JSON.parse(data)

    // Validate index structure
    if (!importedIndex.projectId || !importedIndex.chunks || !Array.isArray(importedIndex.chunks)) {
      throw new Error('Invalid index file format')
    }

    this.index = importedIndex
    this.saveIndex()
  }

  findSimilarChunks(chunk: DocumentChunk, limit: number = 5): SearchResult[] {
    if (!this.index) return []

    const results: SearchResult[] = []

    for (const otherChunk of this.index.chunks) {
      if (otherChunk.id === chunk.id) continue

      const score = this.calculateSimilarity(chunk.content, otherChunk.content)

      if (score > 0.1) {
        results.push({
          chunk: otherChunk,
          score,
          context: this.getContext(otherChunk),
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }
}
