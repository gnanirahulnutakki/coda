import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'
import { handleMultiRepoCommand } from '../../src/cli/multi-repo.js'
import { MultiRepoManager } from '../../src/features/multi-repo.js'

vi.mock('../../src/features/multi-repo.js')
vi.mock('fs')

describe('multi-repo CLI', () => {
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

    // Mock MultiRepoManager
    mockManager = {
      addRepository: vi.fn(),
      removeRepository: vi.fn(),
      getRepositories: vi.fn(),
      getRelationships: vi.fn(),
      addRelationship: vi.fn(),
      searchAcrossRepos: vi.fn(),
      getCrossRepoContext: vi.fn(),
      syncRepository: vi.fn(),
      generateContextSummary: vi.fn(),
      exportConfiguration: vi.fn(),
      importConfiguration: vi.fn(),
    }

    vi.mocked(MultiRepoManager).mockImplementation(() => mockManager)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handleMultiRepoCommand([])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multi-Repository Context Management'),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'))
    })

    it('should display help for help command', async () => {
      await handleMultiRepoCommand(['help'])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multi-Repository Context Management'),
      )
    })

    it('should display help for --help flag', async () => {
      await handleMultiRepoCommand(['--help'])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multi-Repository Context Management'),
      )
    })
  })

  describe('add command', () => {
    it('should add a repository successfully', async () => {
      const mockRepo = {
        id: 'test-repo-abc123',
        name: 'test-repo',
        path: '/test/test-repo',
        url: 'https://github.com/user/test-repo.git',
        branch: 'main',
        metadata: {
          language: 'TypeScript',
          framework: 'React',
        },
      }

      mockManager.addRepository.mockResolvedValue(mockRepo)
      mockManager.getRelationships.mockReturnValue([])

      await handleMultiRepoCommand(['add', '/test/test-repo'])

      expect(mockManager.addRepository).toHaveBeenCalledWith('/test/test-repo')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Added repository: test-repo')
      expect(consoleLogSpy).toHaveBeenCalledWith('  ID: test-repo-abc123')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Language: TypeScript')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Framework: React')
    })

    it('should show auto-detected relationships', async () => {
      const mockRepo = {
        id: 'repo1',
        name: 'repo1',
        path: '/test/repo1',
      }

      const mockRelationships = [{ sourceRepo: 'repo1', targetRepo: 'repo2', type: 'dependency' }]

      mockManager.addRepository.mockResolvedValue(mockRepo)
      mockManager.getRelationships.mockReturnValue(mockRelationships)

      await handleMultiRepoCommand(['add', '/test/repo1'])

      expect(consoleLogSpy).toHaveBeenCalledWith('  Auto-detected relationships:')
      expect(consoleLogSpy).toHaveBeenCalledWith('    - dependency with repo2')
    })

    it('should handle add errors', async () => {
      mockManager.addRepository.mockRejectedValue(new Error('Repository already tracked'))

      await expect(handleMultiRepoCommand(['add', '/test/repo'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository already tracked')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should require repository path', async () => {
      await expect(handleMultiRepoCommand(['add'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository path required')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('remove command', () => {
    it('should remove repository successfully', async () => {
      mockManager.removeRepository.mockReturnValue(true)

      await handleMultiRepoCommand(['remove', 'test-repo'])

      expect(mockManager.removeRepository).toHaveBeenCalledWith('test-repo')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Removed repository: test-repo')
    })

    it('should handle repository not found', async () => {
      mockManager.removeRepository.mockReturnValue(false)

      await expect(handleMultiRepoCommand(['remove', 'nonexistent'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository not found: nonexistent')
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('should require repository identifier', async () => {
      await expect(handleMultiRepoCommand(['remove'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository identifier required')
    })
  })

  describe('list command', () => {
    it('should list all repositories', async () => {
      const mockRepos = [
        {
          id: 'repo1',
          name: 'repo1',
          path: '/test/repo1',
          url: 'https://github.com/user/repo1.git',
          branch: 'main',
          lastSync: new Date().toISOString(),
          metadata: {
            description: 'Test repository 1',
            language: 'JavaScript',
            framework: 'Express',
          },
        },
        {
          id: 'repo2',
          name: 'repo2',
          path: '/test/repo2',
        },
      ]

      const mockRelationships = [
        {
          sourceRepo: 'repo1',
          targetRepo: 'repo2',
          type: 'dependency',
          description: 'Uses shared library',
        },
      ]

      mockManager.getRepositories.mockReturnValue(mockRepos)
      mockManager.getRelationships.mockImplementation((repoId) => {
        if (repoId === 'repo1') return mockRelationships
        return []
      })

      await handleMultiRepoCommand(['list'])

      expect(consoleLogSpy).toHaveBeenCalledWith('Tracked Repositories (2):\n')
      expect(consoleLogSpy).toHaveBeenCalledWith('repo1')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Description: Test repository 1')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Language: JavaScript')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Framework: Express')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Relationships:')
      expect(consoleLogSpy).toHaveBeenCalledWith('    → dependency repo2')
      expect(consoleLogSpy).toHaveBeenCalledWith('      Uses shared library')
    })

    it('should handle empty repository list', async () => {
      mockManager.getRepositories.mockReturnValue([])

      await handleMultiRepoCommand(['list'])

      expect(consoleLogSpy).toHaveBeenCalledWith('No repositories tracked.')
      expect(consoleLogSpy).toHaveBeenCalledWith('Use "coda repo add <path>" to add a repository.')
    })
  })

  describe('sync command', () => {
    it('should sync repository successfully', async () => {
      mockManager.syncRepository.mockResolvedValue(undefined)

      await handleMultiRepoCommand(['sync', 'test-repo'])

      expect(mockManager.syncRepository).toHaveBeenCalledWith('test-repo')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Repository synced successfully')
    })

    it('should handle sync errors', async () => {
      mockManager.syncRepository.mockRejectedValue(new Error('Repository not found'))

      await expect(handleMultiRepoCommand(['sync', 'nonexistent'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository not found')
    })

    it('should require repository identifier', async () => {
      await expect(handleMultiRepoCommand(['sync'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Repository identifier required')
    })
  })

  describe('relate command', () => {
    it('should add relationship successfully', async () => {
      mockManager.addRelationship.mockReturnValue(undefined)

      await handleMultiRepoCommand(['relate', 'repo1', 'repo2', 'dependency', 'API client library'])

      expect(mockManager.addRelationship).toHaveBeenCalledWith(
        'repo1',
        'repo2',
        'dependency',
        'API client library',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Added dependency relationship: repo1 → repo2')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Description: API client library')
    })

    it('should default to related type if invalid type provided', async () => {
      mockManager.addRelationship.mockReturnValue(undefined)

      await handleMultiRepoCommand(['relate', 'repo1', 'repo2', 'invalid-type'])

      expect(mockManager.addRelationship).toHaveBeenCalledWith(
        'repo1',
        'repo2',
        'related',
        undefined,
      )
    })

    it('should handle relationship errors', async () => {
      mockManager.addRelationship.mockImplementation(() => {
        throw new Error('Relationship already exists')
      })

      await expect(handleMultiRepoCommand(['relate', 'repo1', 'repo2'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Relationship already exists')
    })

    it('should require source and target repos', async () => {
      await expect(handleMultiRepoCommand(['relate', 'repo1'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Source and target repositories required')
    })
  })

  describe('search command', () => {
    it('should search across repositories', async () => {
      const mockResults = [
        {
          repo: 'repo1',
          file: 'src/auth.js',
          line: 42,
          content: 'function getUserAuth() {',
          score: 10,
        },
        {
          repo: 'repo1',
          file: 'src/utils.js',
          line: 15,
          content: 'export const getUserAuthToken = () => {',
          score: 8,
        },
        {
          repo: 'repo2',
          file: 'lib/client.js',
          line: 100,
          content: 'const auth = getUserAuth();',
          score: 9,
        },
      ]

      const mockRepos = [
        { id: 'repo1', name: 'api-service' },
        { id: 'repo2', name: 'web-client' },
      ]

      mockManager.searchAcrossRepos.mockResolvedValue(mockResults)
      mockManager.getRepositories.mockReturnValue(mockRepos)

      await handleMultiRepoCommand(['search', 'getUserAuth'])

      expect(mockManager.searchAcrossRepos).toHaveBeenCalledWith('getUserAuth', {})
      expect(consoleLogSpy).toHaveBeenCalledWith('\nFound 3 matches:\n')
      expect(consoleLogSpy).toHaveBeenCalledWith('\napi-service:')
      expect(consoleLogSpy).toHaveBeenCalledWith('  src/auth.js:42')
      expect(consoleLogSpy).toHaveBeenCalledWith('    function getUserAuth() {')
    })

    it('should handle search with options', async () => {
      mockManager.searchAcrossRepos.mockResolvedValue([])

      await handleMultiRepoCommand([
        'search',
        'test',
        '--pattern',
        '*.ts',
        '--max',
        '100',
        '--include',
        'repo1,repo2',
        '--exclude',
        'repo3',
      ])

      expect(mockManager.searchAcrossRepos).toHaveBeenCalledWith('test', {
        filePattern: '*.ts',
        maxResults: 100,
        includeRepos: ['repo1', 'repo2'],
        excludeRepos: ['repo3'],
      })
    })

    it('should handle no search results', async () => {
      mockManager.searchAcrossRepos.mockResolvedValue([])

      await handleMultiRepoCommand(['search', 'nonexistent'])

      expect(consoleLogSpy).toHaveBeenCalledWith('No matches found.')
    })

    it('should require search query', async () => {
      await expect(handleMultiRepoCommand(['search'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Search query required')
    })
  })

  describe('context command', () => {
    it('should display cross-repository context', async () => {
      const mockContext = {
        repositories: [
          { id: 'repo1', name: 'main-app', path: '/test/main-app' },
          {
            id: 'repo2',
            name: 'shared-lib',
            path: '/test/shared-lib',
            metadata: { description: 'Shared utilities' },
          },
        ],
        relationships: [
          {
            sourceRepo: 'repo1',
            targetRepo: 'repo2',
            type: 'dependency',
            description: 'Uses shared utils',
          },
        ],
        sharedConfigs: [{ name: '.eslintrc', path: '.eslintrc', repos: ['repo1', 'repo2'] }],
      }

      mockManager.getCrossRepoContext.mockResolvedValue(mockContext)
      mockManager.generateContextSummary.mockReturnValue('AI Context Summary...')

      await handleMultiRepoCommand(['context', '.'])

      expect(mockManager.getCrossRepoContext).toHaveBeenCalledWith('.')
      expect(consoleLogSpy).toHaveBeenCalledWith('Primary: main-app')
      expect(consoleLogSpy).toHaveBeenCalledWith('\nRelated Repositories:')
      expect(consoleLogSpy).toHaveBeenCalledWith('  - shared-lib (/test/shared-lib)')
      expect(consoleLogSpy).toHaveBeenCalledWith('    Shared utilities')
      expect(consoleLogSpy).toHaveBeenCalledWith('\nRelationships:')
      expect(consoleLogSpy).toHaveBeenCalledWith('  - main-app → shared-lib (dependency)')
      expect(consoleLogSpy).toHaveBeenCalledWith('\nShared Configurations:')
      expect(consoleLogSpy).toHaveBeenCalledWith('  - .eslintrc: main-app, shared-lib')
      expect(consoleLogSpy).toHaveBeenCalledWith('AI Context Summary...')
    })

    it('should use current directory if no path provided', async () => {
      const mockContext = {
        repositories: [{ id: 'repo1', name: 'current', path: '.' }],
        relationships: [],
      }

      mockManager.getCrossRepoContext.mockResolvedValue(mockContext)
      mockManager.generateContextSummary.mockReturnValue('')

      await handleMultiRepoCommand(['context'])

      expect(mockManager.getCrossRepoContext).toHaveBeenCalledWith('.')
    })

    it('should handle context errors', async () => {
      mockManager.getCrossRepoContext.mockRejectedValue(new Error('Primary repository not found'))

      await expect(handleMultiRepoCommand(['context', '/nonexistent'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Primary repository not found')
    })
  })

  describe('export command', () => {
    it('should export configuration successfully', async () => {
      mockManager.exportConfiguration.mockReturnValue(undefined)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          repositories: [{}, {}],
          relationships: [{}],
        }),
      )

      await handleMultiRepoCommand(['export', 'config.json'])

      expect(mockManager.exportConfiguration).toHaveBeenCalledWith('config.json')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Exported configuration to: config.json')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Repositories: 2')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Relationships: 1')
    })

    it('should handle export errors', async () => {
      mockManager.exportConfiguration.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expect(handleMultiRepoCommand(['export', '/readonly/config.json'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Permission denied')
    })

    it('should require output file path', async () => {
      await expect(handleMultiRepoCommand(['export'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Output file path required')
    })
  })

  describe('import command', () => {
    it('should import configuration successfully', async () => {
      mockManager.importConfiguration.mockReturnValue(undefined)
      mockManager.getRepositories.mockReturnValue([{}, {}, {}])
      mockManager.getRelationships.mockReturnValue([
        { sourceRepo: 'r1', targetRepo: 'r2', type: 'dependency' },
        { sourceRepo: 'r1', targetRepo: 'r3', type: 'shared-code' },
      ])

      await handleMultiRepoCommand(['import', 'config.json'])

      expect(mockManager.importConfiguration).toHaveBeenCalledWith('config.json')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Imported configuration from: config.json')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Repositories: 3')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Relationships: 2')
    })

    it('should handle import errors', async () => {
      mockManager.importConfiguration.mockImplementation(() => {
        throw new Error('Configuration file not found')
      })

      await expect(handleMultiRepoCommand(['import', 'missing.json'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Configuration file not found')
    })

    it('should require configuration file path', async () => {
      await expect(handleMultiRepoCommand(['import'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Configuration file path required')
    })
  })

  describe('unknown command', () => {
    it('should show error and help for unknown command', async () => {
      await expect(handleMultiRepoCommand(['unknown'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown command: unknown')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multi-Repository Context Management'),
      )
    })
  })
})
