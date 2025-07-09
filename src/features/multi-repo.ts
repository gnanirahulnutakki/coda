import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { CONFIG_PATHS } from '../config/paths.js'

export interface Repository {
  id: string
  name: string
  path: string
  url?: string
  branch?: string
  lastSync?: string
  metadata?: {
    description?: string
    language?: string
    framework?: string
    dependencies?: string[]
    relatedRepos?: string[]
  }
}

export interface RepoRelationship {
  sourceRepo: string
  targetRepo: string
  type: 'dependency' | 'shared-code' | 'microservice' | 'monorepo' | 'fork' | 'related'
  description?: string
}

export interface CrossRepoContext {
  repositories: Repository[]
  relationships: RepoRelationship[]
  sharedConfigs?: SharedConfig[]
  sharedTypes?: SharedType[]
}

export interface SharedConfig {
  name: string
  path: string
  repos: string[]
  content?: string
}

export interface SharedType {
  name: string
  definition: string
  sourceRepo: string
  usedInRepos: string[]
}

export interface SearchResult {
  repo: string
  file: string
  line: number
  content: string
  score: number
}

export class MultiRepoManager {
  private dataDir: string
  private repositories: Map<string, Repository> = new Map()
  private relationships: RepoRelationship[] = []
  private maxRepos: number = 20

  constructor() {
    this.dataDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'multi-repo')
    this.ensureDataDirectory()
    this.loadRepositories()
    this.loadRelationships()
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  private loadRepositories(): void {
    const reposFile = path.join(this.dataDir, 'repositories.json')
    if (fs.existsSync(reposFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(reposFile, 'utf8'))
        data.forEach((repo: Repository) => {
          this.repositories.set(repo.id, repo)
        })
      } catch (error) {
        console.warn('Failed to load repositories:', error.message)
      }
    }
  }

  private loadRelationships(): void {
    const relFile = path.join(this.dataDir, 'relationships.json')
    if (fs.existsSync(relFile)) {
      try {
        this.relationships = JSON.parse(fs.readFileSync(relFile, 'utf8'))
      } catch (error) {
        console.warn('Failed to load relationships:', error.message)
      }
    }
  }

  private saveRepositories(): void {
    const reposFile = path.join(this.dataDir, 'repositories.json')
    const repos = Array.from(this.repositories.values())
    fs.writeFileSync(reposFile, JSON.stringify(repos, null, 2))
  }

  private saveRelationships(): void {
    const relFile = path.join(this.dataDir, 'relationships.json')
    fs.writeFileSync(relFile, JSON.stringify(this.relationships, null, 2))
  }

  /**
   * Add a repository to track
   */
  async addRepository(
    repoPath: string,
    metadata?: Partial<Repository['metadata']>,
  ): Promise<Repository> {
    const absolutePath = path.resolve(repoPath)

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`)
    }

    if (!fs.existsSync(path.join(absolutePath, '.git'))) {
      throw new Error(`Not a git repository: ${repoPath}`)
    }

    // Get repository info
    const repoName = path.basename(absolutePath)
    const repoId = this.generateRepoId(absolutePath)

    // Check if already exists
    if (this.repositories.has(repoId)) {
      throw new Error(`Repository already tracked: ${repoName}`)
    }

    // Check max repos limit
    if (this.repositories.size >= this.maxRepos) {
      throw new Error(`Maximum number of repositories (${this.maxRepos}) reached`)
    }

    // Get git info
    let url: string | undefined
    let branch: string | undefined

    try {
      url = execSync('git config --get remote.origin.url', {
        cwd: absolutePath,
        encoding: 'utf8',
      }).trim()

      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: absolutePath,
        encoding: 'utf8',
      }).trim()
    } catch (error) {
      // Git commands might fail, that's okay
    }

    // Detect language and framework
    const detectedMetadata = await this.detectRepoMetadata(absolutePath)

    const repository: Repository = {
      id: repoId,
      name: repoName,
      path: absolutePath,
      url,
      branch,
      lastSync: new Date().toISOString(),
      metadata: {
        ...detectedMetadata,
        ...metadata,
      },
    }

    this.repositories.set(repoId, repository)
    this.saveRepositories()

    // Auto-detect relationships
    await this.detectRelationships(repository)

    return repository
  }

  /**
   * Remove a repository
   */
  removeRepository(repoIdOrPath: string): boolean {
    let repoId = repoIdOrPath

    // If path provided, convert to ID
    if (repoIdOrPath.includes('/') || repoIdOrPath.includes('\\')) {
      repoId = this.generateRepoId(path.resolve(repoIdOrPath))
    }

    if (!this.repositories.has(repoId)) {
      return false
    }

    // Remove repository
    this.repositories.delete(repoId)

    // Remove related relationships
    this.relationships = this.relationships.filter(
      (rel) => rel.sourceRepo !== repoId && rel.targetRepo !== repoId,
    )

    this.saveRepositories()
    this.saveRelationships()

    return true
  }

  /**
   * Add a relationship between repositories
   */
  addRelationship(
    sourceRepo: string,
    targetRepo: string,
    type: RepoRelationship['type'],
    description?: string,
  ): void {
    // Validate repos exist
    const sourceId = this.findRepoId(sourceRepo)
    const targetId = this.findRepoId(targetRepo)

    if (!sourceId || !targetId) {
      throw new Error('One or both repositories not found')
    }

    // Check if relationship already exists
    const exists = this.relationships.some(
      (rel) => rel.sourceRepo === sourceId && rel.targetRepo === targetId && rel.type === type,
    )

    if (exists) {
      throw new Error('Relationship already exists')
    }

    this.relationships.push({
      sourceRepo: sourceId,
      targetRepo: targetId,
      type,
      description,
    })

    this.saveRelationships()
  }

  /**
   * Get all tracked repositories
   */
  getRepositories(): Repository[] {
    return Array.from(this.repositories.values())
  }

  /**
   * Get relationships for a repository
   */
  getRelationships(repoIdOrPath: string): RepoRelationship[] {
    const repoId = this.findRepoId(repoIdOrPath)
    if (!repoId) return []

    return this.relationships.filter(
      (rel) => rel.sourceRepo === repoId || rel.targetRepo === repoId,
    )
  }

  /**
   * Search across all repositories
   */
  async searchAcrossRepos(
    query: string,
    options: {
      filePattern?: string
      maxResults?: number
      includeRepos?: string[]
      excludeRepos?: string[]
    } = {},
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    const { filePattern = '*', maxResults = 50, includeRepos, excludeRepos } = options

    for (const repo of this.repositories.values()) {
      // Filter repos
      if (includeRepos && !includeRepos.includes(repo.id)) continue
      if (excludeRepos && excludeRepos.includes(repo.id)) continue

      try {
        // Use ripgrep for fast searching
        const command = `rg --json "${query}" --glob "${filePattern}" --max-count ${maxResults}`
        const output = execSync(command, {
          cwd: repo.path,
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024, // 10MB
        })

        const lines = output
          .trim()
          .split('\n')
          .filter((line) => line)

        for (const line of lines) {
          try {
            const result = JSON.parse(line)
            if (result.type === 'match') {
              results.push({
                repo: repo.id,
                file: result.data.path.text,
                line: result.data.line_number,
                content: result.data.lines.text.trim(),
                score: this.calculateSearchScore(query, result.data.lines.text),
              })
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      } catch (error) {
        // Search might fail for some repos, continue with others
      }

      if (results.length >= maxResults) break
    }

    // Sort by score
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults)
  }

  /**
   * Get cross-repository context
   */
  async getCrossRepoContext(primaryRepoPath: string): Promise<CrossRepoContext> {
    const primaryId = this.findRepoId(primaryRepoPath)
    if (!primaryId) {
      throw new Error('Primary repository not found')
    }

    const context: CrossRepoContext = {
      repositories: [],
      relationships: [],
    }

    // Add primary repo
    const primaryRepo = this.repositories.get(primaryId)!
    context.repositories.push(primaryRepo)

    // Add related repos
    const relatedRepos = new Set<string>()
    const relationships = this.getRelationships(primaryId)

    for (const rel of relationships) {
      context.relationships.push(rel)
      relatedRepos.add(rel.sourceRepo === primaryId ? rel.targetRepo : rel.sourceRepo)
    }

    // Add related repositories
    for (const repoId of relatedRepos) {
      const repo = this.repositories.get(repoId)
      if (repo) {
        context.repositories.push(repo)
      }
    }

    // Find shared configs
    context.sharedConfigs = await this.findSharedConfigs(context.repositories)

    // Find shared types
    context.sharedTypes = await this.findSharedTypes(context.repositories)

    return context
  }

  /**
   * Sync repository information
   */
  async syncRepository(repoIdOrPath: string): Promise<void> {
    const repoId = this.findRepoId(repoIdOrPath)
    if (!repoId) {
      throw new Error('Repository not found')
    }

    const repo = this.repositories.get(repoId)!

    // Update git info
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repo.path,
        encoding: 'utf8',
      }).trim()

      repo.branch = branch
      repo.lastSync = new Date().toISOString()

      // Re-detect metadata
      const metadata = await this.detectRepoMetadata(repo.path)
      repo.metadata = { ...repo.metadata, ...metadata }

      this.saveRepositories()
    } catch (error) {
      throw new Error(`Failed to sync repository: ${error.message}`)
    }
  }

  /**
   * Generate context summary for AI
   */
  generateContextSummary(): string {
    const lines: string[] = []

    lines.push('Multi-Repository Context:')
    lines.push('')

    // List repositories
    lines.push('Tracked Repositories:')
    for (const repo of this.repositories.values()) {
      lines.push(`- ${repo.name} (${repo.path})`)
      if (repo.metadata?.description) {
        lines.push(`  Description: ${repo.metadata.description}`)
      }
      if (repo.metadata?.language) {
        lines.push(`  Language: ${repo.metadata.language}`)
      }
      if (repo.metadata?.framework) {
        lines.push(`  Framework: ${repo.metadata.framework}`)
      }
    }

    lines.push('')

    // List relationships
    if (this.relationships.length > 0) {
      lines.push('Repository Relationships:')
      for (const rel of this.relationships) {
        const source = this.repositories.get(rel.sourceRepo)?.name || rel.sourceRepo
        const target = this.repositories.get(rel.targetRepo)?.name || rel.targetRepo
        lines.push(`- ${source} -> ${target} (${rel.type})`)
        if (rel.description) {
          lines.push(`  ${rel.description}`)
        }
      }
    }

    return lines.join('\n')
  }

  /**
   * Export multi-repo configuration
   */
  exportConfiguration(outputPath: string): void {
    const config = {
      repositories: Array.from(this.repositories.values()),
      relationships: this.relationships,
      exportDate: new Date().toISOString(),
    }

    fs.writeFileSync(outputPath, JSON.stringify(config, null, 2))
  }

  /**
   * Import multi-repo configuration
   */
  importConfiguration(configPath: string): void {
    if (!fs.existsSync(configPath)) {
      throw new Error('Configuration file not found')
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

      // Validate and import repositories
      if (config.repositories && Array.isArray(config.repositories)) {
        this.repositories.clear()
        for (const repo of config.repositories) {
          if (repo.id && repo.name && repo.path) {
            this.repositories.set(repo.id, repo)
          }
        }
      }

      // Import relationships
      if (config.relationships && Array.isArray(config.relationships)) {
        this.relationships = config.relationships
      }

      this.saveRepositories()
      this.saveRelationships()
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`)
    }
  }

  private generateRepoId(repoPath: string): string {
    // Use a combination of path and name for ID
    const name = path.basename(repoPath)
    const hash = Buffer.from(repoPath).toString('base64').substring(0, 8)
    return `${name}-${hash}`
  }

  private findRepoId(repoIdOrPath: string): string | null {
    // Direct ID match
    if (this.repositories.has(repoIdOrPath)) {
      return repoIdOrPath
    }

    // Path match
    const absolutePath = path.resolve(repoIdOrPath)
    for (const [id, repo] of this.repositories) {
      if (repo.path === absolutePath) {
        return id
      }
    }

    // Name match
    for (const [id, repo] of this.repositories) {
      if (repo.name === repoIdOrPath) {
        return id
      }
    }

    return null
  }

  private async detectRepoMetadata(repoPath: string): Promise<Partial<Repository['metadata']>> {
    const metadata: Partial<Repository['metadata']> = {}

    // Detect language
    const files = fs.readdirSync(repoPath)

    if (files.includes('package.json')) {
      metadata.language = 'JavaScript/TypeScript'
      try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'))
        metadata.description = packageJson.description
        metadata.dependencies = Object.keys(packageJson.dependencies || {})

        // Detect framework
        const deps = [
          ...Object.keys(packageJson.dependencies || {}),
          ...Object.keys(packageJson.devDependencies || {}),
        ]
        if (deps.includes('react')) metadata.framework = 'React'
        else if (deps.includes('vue')) metadata.framework = 'Vue'
        else if (deps.includes('angular')) metadata.framework = 'Angular'
        else if (deps.includes('express')) metadata.framework = 'Express'
        else if (deps.includes('next')) metadata.framework = 'Next.js'
      } catch (e) {}
    } else if (files.includes('requirements.txt') || files.includes('setup.py')) {
      metadata.language = 'Python'
      if (files.includes('requirements.txt')) {
        try {
          const requirements = fs.readFileSync(path.join(repoPath, 'requirements.txt'), 'utf8')
          const deps = requirements.split('\n').filter((line) => line && !line.startsWith('#'))
          metadata.dependencies = deps.map((dep) => dep.split('==')[0].trim())

          // Detect framework
          if (deps.some((d) => d.includes('django'))) metadata.framework = 'Django'
          else if (deps.some((d) => d.includes('flask'))) metadata.framework = 'Flask'
          else if (deps.some((d) => d.includes('fastapi'))) metadata.framework = 'FastAPI'
        } catch (e) {}
      }
    } else if (files.includes('pom.xml')) {
      metadata.language = 'Java'
      metadata.framework = 'Maven'
    } else if (files.includes('build.gradle')) {
      metadata.language = 'Java'
      metadata.framework = 'Gradle'
    } else if (files.includes('Cargo.toml')) {
      metadata.language = 'Rust'
    } else if (files.includes('go.mod')) {
      metadata.language = 'Go'
    }

    return metadata
  }

  private async detectRelationships(repo: Repository): Promise<void> {
    if (!repo.metadata?.dependencies) return

    // Check if any dependencies match tracked repositories
    for (const dep of repo.metadata.dependencies) {
      for (const [otherId, otherRepo] of this.repositories) {
        if (otherId === repo.id) continue

        // Simple name matching
        if (otherRepo.name.toLowerCase() === dep.toLowerCase()) {
          try {
            this.addRelationship(
              repo.id,
              otherId,
              'dependency',
              `${repo.name} depends on ${otherRepo.name}`,
            )
          } catch (e) {
            // Relationship might already exist
          }
        }
      }
    }
  }

  private async findSharedConfigs(repos: Repository[]): Promise<SharedConfig[]> {
    const configs: SharedConfig[] = []
    const configPatterns = [
      '.eslintrc*',
      '.prettierrc*',
      'tsconfig.json',
      'jest.config.*',
      '.gitignore',
      'Dockerfile',
      'docker-compose.yml',
    ]

    for (const pattern of configPatterns) {
      const reposWithConfig: string[] = []
      let commonContent: string | undefined

      for (const repo of repos) {
        const files = fs.readdirSync(repo.path)
        const configFile = files.find((f) => f.match(new RegExp(pattern.replace('*', '.*'))))

        if (configFile) {
          reposWithConfig.push(repo.id)

          if (!commonContent) {
            try {
              commonContent = fs.readFileSync(path.join(repo.path, configFile), 'utf8')
            } catch (e) {}
          }
        }
      }

      if (reposWithConfig.length > 1) {
        configs.push({
          name: pattern,
          path: pattern,
          repos: reposWithConfig,
          content: commonContent,
        })
      }
    }

    return configs
  }

  private async findSharedTypes(repos: Repository[]): Promise<SharedType[]> {
    const types: SharedType[] = []

    // This is a simplified implementation
    // In a real implementation, you'd parse TypeScript/JavaScript files
    // to find exported types and their usage across repos

    return types
  }

  private calculateSearchScore(query: string, content: string): number {
    const queryLower = query.toLowerCase()
    const contentLower = content.toLowerCase()

    let score = 0

    // Exact match
    if (contentLower.includes(queryLower)) {
      score += 10
    }

    // Word boundaries
    const queryWords = queryLower.split(/\s+/)
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        score += 5
      }
    }

    // Beginning of line
    if (contentLower.trimStart().startsWith(queryLower)) {
      score += 3
    }

    return score
  }
}
