import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'
import { log, warn } from '../utils/logging.js'
import type { AppConfig } from '../config/schemas.js'

export interface DocumentationConfig {
  paths?: string[]
  file_patterns?: string[]
  auto_include?: boolean
  max_size_mb?: number
}

export class DocumentationLoader {
  private docPaths: string[]
  private filePatterns: string[]
  private autoInclude: boolean
  private maxSizeBytes: number
  private indexedDocs: Map<string, string> = new Map()

  constructor(config: DocumentationConfig) {
    this.docPaths = config.paths || ['./docs', './README.md', './wiki']
    this.filePatterns = config.file_patterns || ['**/*.md', '**/*.txt', '**/*.rst']
    this.autoInclude = config.auto_include ?? false
    this.maxSizeBytes = (config.max_size_mb || 10) * 1024 * 1024
  }

  /**
   * Load and index documentation from configured paths
   */
  async loadDocumentation(): Promise<void> {
    log('※ Loading documentation...')

    for (const docPath of this.docPaths) {
      if (docPath.startsWith('http://') || docPath.startsWith('https://')) {
        // TODO: Implement web documentation fetching
        warn(`※ Web documentation not yet supported: ${docPath}`)
        continue
      }

      const resolvedPath = path.resolve(docPath)

      if (!fs.existsSync(resolvedPath)) {
        continue
      }

      const stats = fs.statSync(resolvedPath)

      if (stats.isFile()) {
        await this.loadFile(resolvedPath)
      } else if (stats.isDirectory()) {
        await this.loadDirectory(resolvedPath)
      }
    }

    log(`※ Loaded ${this.indexedDocs.size} documentation files`)
  }

  /**
   * Load a single documentation file
   */
  private async loadFile(filePath: string): Promise<void> {
    try {
      const stats = fs.statSync(filePath)

      if (stats.size > this.maxSizeBytes) {
        warn(`※ Skipping large file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`)
        return
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const relativePath = path.relative(process.cwd(), filePath)

      this.indexedDocs.set(relativePath, content)
    } catch (error) {
      warn(`※ Failed to load documentation file: ${filePath}`)
    }
  }

  /**
   * Load all matching files from a directory
   */
  private async loadDirectory(dirPath: string): Promise<void> {
    for (const pattern of this.filePatterns) {
      const files = glob.sync(pattern, {
        cwd: dirPath,
        absolute: true,
        nodir: true,
      })

      for (const file of files) {
        await this.loadFile(file)
      }
    }
  }

  /**
   * Search documentation for relevant content
   */
  searchDocumentation(
    query: string,
    maxResults: number = 5,
  ): Array<{ path: string; snippet: string; score: number }> {
    const results: Array<{ path: string; snippet: string; score: number }> = []
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2)

    for (const [docPath, content] of this.indexedDocs) {
      const contentLower = content.toLowerCase()
      let score = 0

      // Simple scoring based on word matches
      for (const word of queryWords) {
        const matches = (contentLower.match(new RegExp(word, 'g')) || []).length
        score += matches
      }

      if (score > 0) {
        // Extract relevant snippet around first match
        const firstMatch = queryWords.find((w) => contentLower.includes(w))
        if (firstMatch) {
          const index = contentLower.indexOf(firstMatch)
          const start = Math.max(0, index - 100)
          const end = Math.min(content.length, index + 200)
          const snippet = content.substring(start, end).trim()

          results.push({
            path: docPath,
            snippet: snippet.length > 200 ? snippet.substring(0, 200) + '...' : snippet,
            score,
          })
        }
      }
    }

    // Sort by score and return top results
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
  }

  /**
   * Get all indexed documentation as context
   */
  getDocumentationContext(maxTokens: number = 4000): string {
    let context = '# Project Documentation\n\n'
    let currentTokens = 0

    // Rough token estimation (1 token ≈ 4 characters)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4)

    for (const [docPath, content] of this.indexedDocs) {
      const header = `\n## ${docPath}\n\n`
      const tokens = estimateTokens(header + content)

      if (currentTokens + tokens > maxTokens) {
        // Try to fit a snippet
        const remainingTokens = maxTokens - currentTokens
        const snippetLength = remainingTokens * 4

        if (snippetLength > 200) {
          context += header + content.substring(0, snippetLength) + '...\n'
        }
        break
      }

      context += header + content + '\n'
      currentTokens += tokens
    }

    return context
  }

  /**
   * Check if documentation should be auto-included
   */
  shouldAutoInclude(): boolean {
    return this.autoInclude
  }
}
