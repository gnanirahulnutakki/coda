import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { ContextMemory } from '../../src/features/context-memory.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')

describe('ContextMemory', () => {
  let contextMemory: ContextMemory
  const mockMemoryDir = '/test/.coda/memory'
  const mockProjectPath = '/test/project'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue('/test/.coda')

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])

    contextMemory = new ContextMemory()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create memory directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/test/.coda', 'memory'), {
        recursive: true,
      })
    })

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks()
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined)

      new ContextMemory()

      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('loadProjectContext', () => {
    it('should create new context if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const context = await contextMemory.loadProjectContext(mockProjectPath)

      expect(context).toMatchObject({
        projectPath: mockProjectPath,
        entries: [],
      })
      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should load existing context from file', async () => {
      const mockContext = {
        projectId: 'test-id',
        projectPath: mockProjectPath,
        lastUpdated: '2024-01-01',
        entries: [
          {
            id: 'entry-1',
            timestamp: '2024-01-01',
            type: 'file_edit' as const,
            content: 'Updated file',
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockContext))

      const context = await contextMemory.loadProjectContext(mockProjectPath)

      expect(context).toEqual(mockContext)
    })

    it('should handle corrupted context file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      const context = await contextMemory.loadProjectContext(mockProjectPath)

      expect(context.entries).toEqual([])
      expect(context.projectPath).toBe(mockProjectPath)
    })
  })

  describe('addEntry', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)
    })

    it('should add entry to context', async () => {
      const entry = {
        type: 'file_edit' as const,
        content: 'Updated authentication',
        metadata: {
          file: 'src/auth.ts',
        },
      }

      await contextMemory.addEntry(entry)
      const recent = contextMemory.getRecentContext()

      expect(recent).toHaveLength(1)
      expect(recent[0]).toMatchObject(entry)
      expect(recent[0].id).toBeDefined()
      expect(recent[0].timestamp).toBeDefined()
    })

    it('should limit entries to maxEntriesPerProject', async () => {
      // Add more than max entries
      for (let i = 0; i < 1005; i++) {
        await contextMemory.addEntry({
          type: 'command',
          content: `Command ${i}`,
          metadata: { command: `cmd ${i}` },
        })
      }

      const recent = contextMemory.getRecentContext(2000)
      expect(recent.length).toBeLessThanOrEqual(1000)
    })

    it('should not add entry without loaded context', async () => {
      const memory = new ContextMemory()

      await memory.addEntry({
        type: 'command',
        content: 'test',
      })

      expect(memory.getRecentContext()).toEqual([])
    })
  })

  describe('getRecentContext', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)
    })

    it('should return recent entries in reverse order', async () => {
      await contextMemory.addEntry({ type: 'command', content: 'First' })
      await contextMemory.addEntry({ type: 'command', content: 'Second' })
      await contextMemory.addEntry({ type: 'command', content: 'Third' })

      const recent = contextMemory.getRecentContext(2)

      expect(recent).toHaveLength(2)
      expect(recent[0].content).toBe('Third')
      expect(recent[1].content).toBe('Second')
    })

    it('should return empty array if no context loaded', () => {
      const memory = new ContextMemory()
      expect(memory.getRecentContext()).toEqual([])
    })
  })

  describe('searchContext', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)

      await contextMemory.addEntry({
        type: 'file_edit',
        content: 'Updated authentication logic',
        metadata: { file: 'src/auth.ts' },
      })

      await contextMemory.addEntry({
        type: 'command',
        content: 'Running tests',
        metadata: { command: 'npm test auth' },
      })

      await contextMemory.addEntry({
        type: 'decision',
        content: 'Using JWT for authentication',
      })
    })

    it('should search by content', () => {
      const results = contextMemory.searchContext('auth')
      expect(results).toHaveLength(3)
    })

    it('should search by type', () => {
      const results = contextMemory.searchContext('', 'command')
      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('command')
    })

    it('should search by metadata', () => {
      const results = contextMemory.searchContext('auth.ts')
      expect(results).toHaveLength(1)
      expect(results[0].metadata?.file).toBe('src/auth.ts')
    })

    it('should be case insensitive', () => {
      const results = contextMemory.searchContext('AUTH')
      expect(results).toHaveLength(3)
    })
  })

  describe('updateProjectMetadata', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)
    })

    it('should update project summary', async () => {
      await contextMemory.updateProjectMetadata({
        summary: 'E-commerce platform with microservices',
      })

      const summary = contextMemory.getContextSummary()
      expect(summary).toContain('E-commerce platform with microservices')
    })

    it('should update key decisions', async () => {
      await contextMemory.updateProjectMetadata({
        keyDecisions: ['Using PostgreSQL', 'RESTful API design'],
      })

      const summary = contextMemory.getContextSummary()
      expect(summary).toContain('Using PostgreSQL')
      expect(summary).toContain('RESTful API design')
    })

    it('should update architecture', async () => {
      await contextMemory.updateProjectMetadata({
        architecture: 'Microservices with API Gateway',
      })

      const summary = contextMemory.getContextSummary()
      expect(summary).toContain('Microservices with API Gateway')
    })
  })

  describe('getContextSummary', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)
    })

    it('should include all metadata in summary', async () => {
      await contextMemory.updateProjectMetadata({
        summary: 'Test project',
        architecture: 'Monolith',
        keyDecisions: ['Decision 1', 'Decision 2'],
      })

      await contextMemory.addEntry({
        type: 'file_edit',
        content: 'Updated file',
        metadata: { file: 'test.js' },
      })

      await contextMemory.addEntry({
        type: 'command',
        content: 'Run command',
        metadata: { command: 'npm test' },
      })

      const summary = contextMemory.getContextSummary()

      expect(summary).toContain('Test project')
      expect(summary).toContain('Monolith')
      expect(summary).toContain('Decision 1')
      expect(summary).toContain('test.js')
      expect(summary).toContain('npm test')
    })

    it('should return empty string if no context loaded', () => {
      const memory = new ContextMemory()
      expect(memory.getContextSummary()).toBe('')
    })
  })

  describe('cleanupOldMemory', () => {
    it('should remove files older than maxMemoryAgeDays', async () => {
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)

      const recentDate = new Date()

      vi.mocked(fs.readdirSync).mockReturnValue(['old.json', 'recent.json'])
      vi.mocked(fs.statSync)
        .mockReturnValueOnce({ mtime: oldDate } as any)
        .mockReturnValueOnce({ mtime: recentDate } as any)
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

      await contextMemory.cleanupOldMemory()

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockMemoryDir, 'old.json'))
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(mockMemoryDir, 'recent.json'))
    })

    it('should skip non-json files', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['file.txt', 'data.json'])
      vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date(0) } as any)

      await contextMemory.cleanupOldMemory()

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1)
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockMemoryDir, 'data.json'))
    })
  })

  describe('export/import', () => {
    beforeEach(async () => {
      await contextMemory.loadProjectContext(mockProjectPath)
      await contextMemory.addEntry({
        type: 'command',
        content: 'Test entry',
      })
    })

    it('should export memory to file', async () => {
      const outputPath = '/test/export.json'

      await contextMemory.exportMemory(outputPath)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        expect.stringContaining('Test entry'),
      )
    })

    it('should throw error if no context loaded', async () => {
      const memory = new ContextMemory()

      await expect(memory.exportMemory('/test/export.json')).rejects.toThrow(
        'No project context loaded',
      )
    })

    it('should import memory from file', async () => {
      const importData = {
        projectId: 'imported-id',
        projectPath: '/imported/path',
        lastUpdated: '2024-01-01',
        entries: [
          {
            id: 'imp-1',
            timestamp: '2024-01-01',
            type: 'command' as const,
            content: 'Imported command',
          },
        ],
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(importData))

      await contextMemory.importMemory('/test/import.json')

      const recent = contextMemory.getRecentContext()
      expect(recent[0].content).toBe('Imported command')
    })

    it('should validate imported data structure', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{"invalid": "data"}')

      await expect(contextMemory.importMemory('/test/import.json')).rejects.toThrow(
        'Invalid memory file format',
      )
    })
  })
})
