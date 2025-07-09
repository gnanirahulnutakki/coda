import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { MultiRepoManager } from '../../src/features/multi-repo.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('child_process')
vi.mock('../../src/config/paths.js')

describe('MultiRepoManager', () => {
  let multiRepoManager: MultiRepoManager
  const mockConfigDir = '/test/.coda'
  const mockDataDir = '/test/.coda/multi-repo'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('[]')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])

    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project')

    multiRepoManager = new MultiRepoManager()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create data directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDataDir, { recursive: true })
    })

    it('should load existing repositories', () => {
      const mockRepos = [
        { id: 'repo1', name: 'repo1', path: '/test/repo1' },
        { id: 'repo2', name: 'repo2', path: '/test/repo2' },
      ]

      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'repositories.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockRepos))

      const manager = new MultiRepoManager()
      const repos = manager.getRepositories()

      expect(repos).toHaveLength(2)
      expect(repos[0].name).toBe('repo1')
      expect(repos[1].name).toBe('repo2')
    })

    it('should load existing relationships', () => {
      const mockRelationships = [
        { sourceRepo: 'repo1', targetRepo: 'repo2', type: 'dependency' as const },
      ]

      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'relationships.json')
      })
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('relationships.json')) {
          return JSON.stringify(mockRelationships)
        }
        return '[]'
      })

      const manager = new MultiRepoManager()
      // Add repos first
      vi.mocked(fs.existsSync).mockReturnValue(true)
      manager['repositories'].set('repo1', { id: 'repo1', name: 'repo1', path: '/test/repo1' })
      manager['repositories'].set('repo2', { id: 'repo2', name: 'repo2', path: '/test/repo2' })

      const relationships = manager.getRelationships('repo1')
      expect(relationships).toHaveLength(1)
    })

    it('should handle corrupted data files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      // Should not throw, just warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      new MultiRepoManager()

      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('addRepository', () => {
    it('should add a git repository', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/myrepo' || filePath === '/test/myrepo/.git'
      })

      vi.mocked(execSync).mockImplementation((command: string) => {
        if (command.includes('remote.origin.url')) {
          return 'https://github.com/user/myrepo.git\n'
        }
        if (command.includes('rev-parse')) {
          return 'main\n'
        }
        return ''
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['package.json'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('package.json')) {
          return JSON.stringify({
            description: 'My test repo',
            dependencies: { react: '^18.0.0' },
          })
        }
        return '[]'
      })

      const repo = await multiRepoManager.addRepository('/test/myrepo')

      expect(repo.name).toBe('myrepo')
      expect(repo.path).toBe('/test/myrepo')
      expect(repo.url).toBe('https://github.com/user/myrepo.git')
      expect(repo.branch).toBe('main')
      expect(repo.metadata?.description).toBe('My test repo')
      expect(repo.metadata?.language).toBe('JavaScript/TypeScript')
      expect(repo.metadata?.framework).toBe('React')
    })

    it('should throw error if path does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(multiRepoManager.addRepository('/nonexistent')).rejects.toThrow(
        'Repository path does not exist',
      )
    })

    it('should throw error if not a git repository', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/notgit' // but not .git subdirectory
      })

      await expect(multiRepoManager.addRepository('/test/notgit')).rejects.toThrow(
        'Not a git repository',
      )
    })

    it('should throw error if repository already tracked', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['package.json'] as any)

      await multiRepoManager.addRepository('/test/repo1')

      await expect(multiRepoManager.addRepository('/test/repo1')).rejects.toThrow(
        'Repository already tracked',
      )
    })

    it('should throw error if max repos reached', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      // Add max repos
      multiRepoManager['maxRepos'] = 2
      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')

      await expect(multiRepoManager.addRepository('/test/repo3')).rejects.toThrow(
        'Maximum number of repositories',
      )
    })

    it('should detect Python repository', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['requirements.txt'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('requirements.txt')) {
          return 'django==4.0\nrequests==2.28.0'
        }
        return '[]'
      })

      const repo = await multiRepoManager.addRepository('/test/pythonrepo')

      expect(repo.metadata?.language).toBe('Python')
      expect(repo.metadata?.framework).toBe('Django')
      expect(repo.metadata?.dependencies).toContain('django')
    })

    it('should detect Java Maven repository', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['pom.xml'] as any)

      const repo = await multiRepoManager.addRepository('/test/javarepo')

      expect(repo.metadata?.language).toBe('Java')
      expect(repo.metadata?.framework).toBe('Maven')
    })

    it('should handle git command failures gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git command failed')
      })

      const repo = await multiRepoManager.addRepository('/test/repo')

      expect(repo.url).toBeUndefined()
      expect(repo.branch).toBeUndefined()
    })
  })

  describe('removeRepository', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')

      // Add a relationship
      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')
    })

    it('should remove repository by ID', () => {
      const repos = multiRepoManager.getRepositories()
      const repoId = repos[0].id

      const result = multiRepoManager.removeRepository(repoId)

      expect(result).toBe(true)
      expect(multiRepoManager.getRepositories()).toHaveLength(1)
    })

    it('should remove repository by path', () => {
      const result = multiRepoManager.removeRepository('/test/repo1')

      expect(result).toBe(true)
      expect(multiRepoManager.getRepositories()).toHaveLength(1)
    })

    it('should remove related relationships', () => {
      const repos = multiRepoManager.getRepositories()
      const repoId = repos[0].id

      multiRepoManager.removeRepository(repoId)

      const relationships = multiRepoManager.getRelationships(repos[1].id)
      expect(relationships).toHaveLength(0)
    })

    it('should return false if repository not found', () => {
      const result = multiRepoManager.removeRepository('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('addRelationship', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')
    })

    it('should add relationship between repositories', () => {
      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency', 'repo1 depends on repo2')

      const relationships = multiRepoManager.getRelationships('repo1')
      expect(relationships).toHaveLength(1)
      expect(relationships[0].type).toBe('dependency')
      expect(relationships[0].description).toBe('repo1 depends on repo2')
    })

    it('should find repository by name', () => {
      multiRepoManager.addRelationship('repo1', 'repo2', 'microservice')

      const relationships = multiRepoManager.getRelationships('repo1')
      expect(relationships).toHaveLength(1)
    })

    it('should throw error if repository not found', () => {
      expect(() => {
        multiRepoManager.addRelationship('repo1', 'nonexistent', 'dependency')
      }).toThrow('One or both repositories not found')
    })

    it('should throw error if relationship already exists', () => {
      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')

      expect(() => {
        multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')
      }).toThrow('Relationship already exists')
    })
  })

  describe('searchAcrossRepos', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')
    })

    it('should search across all repositories', async () => {
      vi.mocked(execSync).mockImplementation((command: string, options: any) => {
        if (command.includes('rg --json')) {
          if (options.cwd === '/test/repo1') {
            return (
              JSON.stringify({
                type: 'match',
                data: {
                  path: { text: 'src/app.js' },
                  line_number: 10,
                  lines: { text: 'const searchTerm = "test"' },
                },
              }) + '\n'
            )
          }
          if (options.cwd === '/test/repo2') {
            return (
              JSON.stringify({
                type: 'match',
                data: {
                  path: { text: 'lib/utils.js' },
                  line_number: 20,
                  lines: { text: 'function searchTerm() {}' },
                },
              }) + '\n'
            )
          }
        }
        return ''
      })

      const results = await multiRepoManager.searchAcrossRepos('searchTerm')

      expect(results).toHaveLength(2)
      expect(results[0].file).toBe('src/app.js')
      expect(results[1].file).toBe('lib/utils.js')
    })

    it('should filter by file pattern', async () => {
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (command.includes('--glob "*.js"')) {
          return (
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'app.js' },
                line_number: 1,
                lines: { text: 'match' },
              },
            }) + '\n'
          )
        }
        return ''
      })

      const results = await multiRepoManager.searchAcrossRepos('match', {
        filePattern: '*.js',
      })

      expect(results).toHaveLength(2) // One per repo
    })

    it('should include only specified repos', async () => {
      const repos = multiRepoManager.getRepositories()

      vi.mocked(execSync).mockImplementation(() => {
        return (
          JSON.stringify({
            type: 'match',
            data: {
              path: { text: 'file.js' },
              line_number: 1,
              lines: { text: 'content' },
            },
          }) + '\n'
        )
      })

      const results = await multiRepoManager.searchAcrossRepos('content', {
        includeRepos: [repos[0].id],
      })

      expect(results).toHaveLength(1)
      expect(results[0].repo).toBe(repos[0].id)
    })

    it('should handle search failures gracefully', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Search failed')
      })

      const results = await multiRepoManager.searchAcrossRepos('test')

      expect(results).toEqual([])
    })

    it('should calculate search scores', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        return (
          JSON.stringify({
            type: 'match',
            data: {
              path: { text: 'file.js' },
              line_number: 1,
              lines: { text: 'exact match test' },
            },
          }) +
          '\n' +
          JSON.stringify({
            type: 'match',
            data: {
              path: { text: 'file2.js' },
              line_number: 1,
              lines: { text: 'test at beginning' },
            },
          }) +
          '\n'
        )
      })

      const results = await multiRepoManager.searchAcrossRepos('test')

      expect(results[0].score).toBeGreaterThan(0)
    })
  })

  describe('getCrossRepoContext', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['.eslintrc', 'package.json'] as any)

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')
      await multiRepoManager.addRepository('/test/repo3')

      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')
      multiRepoManager.addRelationship('repo1', 'repo3', 'shared-code')
    })

    it('should get context for primary repository', async () => {
      const context = await multiRepoManager.getCrossRepoContext('/test/repo1')

      expect(context.repositories).toHaveLength(3) // Primary + 2 related
      expect(context.relationships).toHaveLength(2)
      expect(context.repositories[0].name).toBe('repo1')
    })

    it('should find shared configs', async () => {
      const context = await multiRepoManager.getCrossRepoContext('/test/repo1')

      expect(context.sharedConfigs).toBeDefined()
      expect(context.sharedConfigs!.length).toBeGreaterThan(0)
      expect(context.sharedConfigs![0].name).toBe('.eslintrc*')
    })

    it('should throw error if repository not found', async () => {
      await expect(multiRepoManager.getCrossRepoContext('/nonexistent')).rejects.toThrow(
        'Primary repository not found',
      )
    })
  })

  describe('syncRepository', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      await multiRepoManager.addRepository('/test/repo1')
    })

    it('should update repository information', async () => {
      vi.mocked(execSync).mockImplementation((command: string) => {
        if (command.includes('rev-parse')) {
          return 'feature-branch\n'
        }
        return ''
      })

      await multiRepoManager.syncRepository('repo1')

      const repos = multiRepoManager.getRepositories()
      expect(repos[0].branch).toBe('feature-branch')
      expect(repos[0].lastSync).toBeDefined()
    })

    it('should throw error if repository not found', async () => {
      await expect(multiRepoManager.syncRepository('nonexistent')).rejects.toThrow(
        'Repository not found',
      )
    })

    it('should handle sync failures', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Git error')
      })

      await expect(multiRepoManager.syncRepository('repo1')).rejects.toThrow(
        'Failed to sync repository',
      )
    })
  })

  describe('generateContextSummary', () => {
    it('should generate summary with repositories and relationships', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['package.json'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.toString().includes('package.json')) {
          return JSON.stringify({ description: 'Test repo' })
        }
        return '[]'
      })

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')
      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')

      const summary = multiRepoManager.generateContextSummary()

      expect(summary).toContain('Multi-Repository Context:')
      expect(summary).toContain('repo1')
      expect(summary).toContain('repo2')
      expect(summary).toContain('dependency')
      expect(summary).toContain('Test repo')
    })
  })

  describe('export/import configuration', () => {
    beforeEach(async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([])

      await multiRepoManager.addRepository('/test/repo1')
      await multiRepoManager.addRepository('/test/repo2')
      multiRepoManager.addRelationship('repo1', 'repo2', 'dependency')
    })

    it('should export configuration', () => {
      multiRepoManager.exportConfiguration('/test/export.json')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/test/export.json')

      expect(writeCall).toBeDefined()
      const exported = JSON.parse(writeCall![1] as string)

      expect(exported.repositories).toHaveLength(2)
      expect(exported.relationships).toHaveLength(1)
      expect(exported.exportDate).toBeDefined()
    })

    it('should import configuration', () => {
      const config = {
        repositories: [{ id: 'imported-repo', name: 'imported', path: '/test/imported' }],
        relationships: [
          { sourceRepo: 'imported-repo', targetRepo: 'other', type: 'fork' as const },
        ],
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(config))

      multiRepoManager.importConfiguration('/test/import.json')

      const repos = multiRepoManager.getRepositories()
      expect(repos).toHaveLength(1)
      expect(repos[0].name).toBe('imported')
    })

    it('should throw error if import file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => {
        multiRepoManager.importConfiguration('/nonexistent.json')
      }).toThrow('Configuration file not found')
    })

    it('should handle invalid import data', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      expect(() => {
        multiRepoManager.importConfiguration('/test/invalid.json')
      }).toThrow('Failed to import configuration')
    })
  })

  describe('auto-detect relationships', () => {
    it('should detect dependency relationships', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['package.json'] as any)

      // First repo - no dependencies
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({
          name: 'shared-lib',
          dependencies: {},
        }),
      )
      await multiRepoManager.addRepository('/test/shared-lib')

      // Second repo - depends on first
      vi.mocked(fs.readFileSync).mockReturnValueOnce(
        JSON.stringify({
          name: 'main-app',
          dependencies: { 'shared-lib': '^1.0.0' },
        }),
      )
      await multiRepoManager.addRepository('/test/main-app')

      const relationships = multiRepoManager.getRelationships('main-app')
      expect(relationships.some((r) => r.type === 'dependency')).toBe(true)
    })
  })
})
