import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { PresetManager } from '../../src/features/preset-manager.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'
import { loadConfigFile } from '../../src/config/loader.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')
vi.mock('../../src/config/loader.js')

describe('PresetManager', () => {
  let manager: PresetManager
  const mockConfigDir = '/test/.coda'
  const mockPresetsDir = '/test/.coda/presets'
  const mockMetadataFile = '/test/.coda/presets/metadata.json'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

    // Mock loadConfigFile
    vi.mocked(loadConfigFile).mockResolvedValue({})

    manager = new PresetManager()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create presets directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockPresetsDir, { recursive: true })
    })

    it('should load metadata if exists', () => {
      const mockMetadata = {
        totalPresets: 5,
        categories: { general: 2, custom: 3 },
        favorites: ['preset-1', 'preset-2'],
        lastUsed: 'preset-1',
      }

      vi.mocked(fs.existsSync).mockImplementation((path) => path === mockMetadataFile)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockMetadata))

      const newManager = new PresetManager()
      const stats = newManager.getStats()

      expect(stats.favorites).toEqual(['preset-1', 'preset-2'])
      expect(stats.lastUsed).toBe('preset-1')
    })

    it('should handle corrupted metadata gracefully', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path === mockMetadataFile)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(() => new PresetManager()).not.toThrow()

      warnSpy.mockRestore()
    })

    it('should load built-in presets', () => {
      const presets = manager.getPresets()

      expect(presets.length).toBeGreaterThan(0)
      expect(presets.some((p) => p.id === 'minimal')).toBe(true)
      expect(presets.some((p) => p.id === 'productive')).toBe(true)
      expect(presets.some((p) => p.id === 'cautious')).toBe(true)
    })

    it('should load custom presets from directory', () => {
      const customPreset = {
        id: 'custom-1',
        name: 'My Custom Preset',
        description: 'Custom configuration',
        category: 'custom',
        tags: ['custom'],
        config: { yolo: true },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue(['custom-1.yaml'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('custom-1.yaml')) {
          return yaml.stringify(customPreset)
        }
        return '{}'
      })

      const newManager = new PresetManager()
      const preset = newManager.getPreset('custom-1')

      expect(preset).toBeDefined()
      expect(preset?.name).toBe('My Custom Preset')
      expect(preset?.isBuiltIn).toBe(false)
    })
  })

  describe('getPresets', () => {
    it('should return all presets', () => {
      const presets = manager.getPresets()

      expect(presets.length).toBeGreaterThan(0)
      expect(presets.every((p) => p.id && p.name && p.config)).toBe(true)
    })

    it('should filter presets by category', () => {
      const generalPresets = manager.getPresets('general')
      expect(generalPresets.every((p) => p.category === 'general')).toBe(true)

      const workflowPresets = manager.getPresets('workflow')
      expect(workflowPresets.every((p) => p.category === 'workflow')).toBe(true)
    })
  })

  describe('getPreset', () => {
    it('should return specific preset by ID', () => {
      const preset = manager.getPreset('minimal')

      expect(preset).toBeDefined()
      expect(preset?.id).toBe('minimal')
      expect(preset?.name).toBe('Minimal')
    })

    it('should return null for non-existent preset', () => {
      const preset = manager.getPreset('non-existent')
      expect(preset).toBeNull()
    })
  })

  describe('searchPresets', () => {
    it('should search by name', () => {
      const results = manager.searchPresets('minimal')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].name.toLowerCase()).toContain('minimal')
    })

    it('should search by description', () => {
      const results = manager.searchPresets('productivity')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some((p) => p.description.toLowerCase().includes('productivity'))).toBe(true)
    })

    it('should search by tags', () => {
      const results = manager.searchPresets('debug')

      expect(results.length).toBeGreaterThan(0)
      expect(results.some((p) => p.tags.includes('debug'))).toBe(true)
    })

    it('should be case-insensitive', () => {
      const results1 = manager.searchPresets('MINIMAL')
      const results2 = manager.searchPresets('minimal')

      expect(results1.length).toBe(results2.length)
    })
  })

  describe('createPreset', () => {
    it('should create a new custom preset', () => {
      const presetData = {
        name: 'My Test Preset',
        description: 'A test preset',
        category: 'custom' as const,
        tags: ['test', 'custom'],
        config: {
          yolo: true,
          debug: false,
        },
        author: 'Test User',
      }

      const preset = manager.createPreset(presetData)

      expect(preset.id).toBe('my-test-preset')
      expect(preset.name).toBe('My Test Preset')
      expect(preset.isBuiltIn).toBe(false)
      expect(preset.created).toBeDefined()

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockPresetsDir, 'my-test-preset.yaml'),
        expect.any(String),
      )
    })

    it('should generate unique ID for duplicate names', () => {
      // First preset
      manager.createPreset({
        name: 'Test Preset',
        description: 'First',
        config: {},
      })

      // Second preset with same name
      const preset2 = manager.createPreset({
        name: 'Test Preset',
        description: 'Second',
        config: {},
      })

      expect(preset2.id).toBe('test-preset-1')
    })

    it('should validate preset configuration', () => {
      expect(() =>
        manager.createPreset({
          name: '',
          description: 'Invalid',
          config: {},
        }),
      ).toThrow()
    })

    it('should save metadata after creation', () => {
      const writeCallsBefore = vi.mocked(fs.writeFileSync).mock.calls.length

      manager.createPreset({
        name: 'Test',
        description: 'Test',
        config: {},
      })

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const metadataWrite = writeCalls.find((call) => call[0].toString().includes('metadata.json'))

      expect(metadataWrite).toBeDefined()
    })
  })

  describe('updatePreset', () => {
    beforeEach(() => {
      // Create a custom preset
      manager.createPreset({
        name: 'Update Test',
        description: 'Original description',
        config: { yolo: false },
      })
    })

    it('should update existing custom preset', async () => {
      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = manager.updatePreset('update-test', {
        description: 'Updated description',
        config: { yolo: true, debug: true },
      })

      expect(updated.description).toBe('Updated description')
      expect(updated.config.yolo).toBe(true)
      expect(updated.config.debug).toBe(true)
      expect(updated.updated).not.toBe(updated.created)
    })

    it('should not allow updating built-in presets', () => {
      expect(() =>
        manager.updatePreset('minimal', {
          description: 'Modified',
        }),
      ).toThrow('Cannot modify built-in presets')
    })

    it('should throw error for non-existent preset', () => {
      expect(() => manager.updatePreset('non-existent', {})).toThrow(
        'Preset non-existent not found',
      )
    })

    it('should not allow changing preset ID', () => {
      const updated = manager.updatePreset('update-test', {
        id: 'new-id',
        description: 'Updated',
      } as any)

      expect(updated.id).toBe('update-test')
    })
  })

  describe('deletePreset', () => {
    beforeEach(() => {
      manager.createPreset({
        name: 'Delete Test',
        description: 'To be deleted',
        config: {},
      })
    })

    it('should delete custom preset', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = manager.deletePreset('delete-test')

      expect(result).toBe(true)
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockPresetsDir, 'delete-test.yaml'))
      expect(manager.getPreset('delete-test')).toBeNull()
    })

    it('should not allow deleting built-in presets', () => {
      expect(() => manager.deletePreset('minimal')).toThrow('Cannot delete built-in presets')
    })

    it('should return false for non-existent preset', () => {
      const result = manager.deletePreset('non-existent')
      expect(result).toBe(false)
    })

    it('should remove from favorites when deleted', () => {
      manager.toggleFavorite('delete-test')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      manager.deletePreset('delete-test')

      const stats = manager.getStats()
      expect(stats.favorites).not.toContain('delete-test')
    })
  })

  describe('applyPreset', () => {
    it('should apply preset configuration', async () => {
      vi.mocked(loadConfigFile).mockResolvedValue({
        existing: 'value',
        yolo: false,
      })

      await manager.applyPreset('productive')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0].toString().includes('config.yaml'))

      expect(writeCall).toBeDefined()
      const savedConfig = yaml.parse(writeCall![1] as string)

      expect(savedConfig.yolo).toBe(true)
      expect(savedConfig.existing).toBe('value')
    })

    it('should update last used metadata', async () => {
      await manager.applyPreset('minimal')

      const stats = manager.getStats()
      expect(stats.lastUsed).toBe('minimal')
    })

    it('should throw error for non-existent preset', async () => {
      await expect(manager.applyPreset('non-existent')).rejects.toThrow(
        'Preset non-existent not found',
      )
    })
  })

  describe('createFromCurrent', () => {
    it('should create preset from current configuration', async () => {
      vi.mocked(loadConfigFile).mockResolvedValue({
        yolo: true,
        debug: false,
        custom_setting: 'value',
      })

      const preset = await manager.createFromCurrent(
        'Current Config',
        'Snapshot of current configuration',
        { category: 'project', tags: ['snapshot'] },
      )

      expect(preset.name).toBe('Current Config')
      expect(preset.config.yolo).toBe(true)
      expect(preset.config.custom_setting).toBe('value')
      expect(preset.category).toBe('project')
    })
  })

  describe('exportPreset', () => {
    it('should export preset to file', () => {
      manager.exportPreset('minimal', '/test/export.yaml')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/test/export.yaml')

      expect(writeCall).toBeDefined()
      const exported = yaml.parse(writeCall![1] as string)

      expect(exported.id).toBe('minimal')
      expect(exported.isBuiltIn).toBeUndefined()
    })

    it('should throw error for non-existent preset', () => {
      expect(() => manager.exportPreset('non-existent', '/test/export.yaml')).toThrow(
        'Preset non-existent not found',
      )
    })
  })

  describe('importPreset', () => {
    it('should import preset from file', () => {
      const presetData = {
        id: 'imported',
        name: 'Imported Preset',
        description: 'Imported from file',
        category: 'custom',
        tags: ['imported'],
        config: { yolo: true },
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(presetData))

      const preset = manager.importPreset('/test/import.yaml')

      expect(preset.id).toBe('imported')
      expect(preset.name).toBe('Imported Preset')
      expect(preset.isBuiltIn).toBe(false)
    })

    it('should generate new ID if conflicts', () => {
      const presetData = {
        id: 'minimal', // Conflicts with built-in
        name: 'Minimal Import',
        description: 'Imported minimal',
        category: 'custom',
        tags: ['imported'],
        config: {},
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(yaml.stringify(presetData))

      const preset = manager.importPreset('/test/import.yaml')

      expect(preset.id).not.toBe('minimal')
      expect(preset.id).toBe('minimal-import')
    })

    it('should validate imported preset', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        yaml.stringify({
          // Missing required fields
          description: 'Invalid',
        }),
      )

      expect(() => manager.importPreset('/test/invalid.yaml')).toThrow('Invalid preset file')
    })

    it('should throw error if file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      expect(() => manager.importPreset('/test/missing.yaml')).toThrow('Import file not found')
    })
  })

  describe('toggleFavorite', () => {
    it('should add preset to favorites', () => {
      const result = manager.toggleFavorite('minimal')

      expect(result).toBe(true)

      const stats = manager.getStats()
      expect(stats.favorites).toContain('minimal')
    })

    it('should remove preset from favorites', () => {
      manager.toggleFavorite('minimal') // Add
      const result = manager.toggleFavorite('minimal') // Remove

      expect(result).toBe(false)

      const stats = manager.getStats()
      expect(stats.favorites).not.toContain('minimal')
    })

    it('should throw error for non-existent preset', () => {
      expect(() => manager.toggleFavorite('non-existent')).toThrow('Preset non-existent not found')
    })
  })

  describe('getFavorites', () => {
    it('should return favorite presets', () => {
      manager.toggleFavorite('minimal')
      manager.toggleFavorite('productive')

      const favorites = manager.getFavorites()

      expect(favorites).toHaveLength(2)
      expect(favorites.some((p) => p.id === 'minimal')).toBe(true)
      expect(favorites.some((p) => p.id === 'productive')).toBe(true)
    })

    it('should filter out deleted favorites', () => {
      manager.createPreset({
        name: 'Temp',
        description: 'Temporary',
        config: {},
      })

      manager.toggleFavorite('temp')
      vi.mocked(fs.existsSync).mockReturnValue(true)
      manager.deletePreset('temp')

      const favorites = manager.getFavorites()
      expect(favorites.every((p) => p.id !== 'temp')).toBe(true)
    })
  })

  describe('getStats', () => {
    it('should return preset statistics', () => {
      const stats = manager.getStats()

      expect(stats.totalPresets).toBeGreaterThan(0)
      expect(stats.categories).toBeDefined()
      expect(Object.keys(stats.categories).length).toBeGreaterThan(0)
    })

    it('should update stats after operations', () => {
      const statsBefore = manager.getStats()

      manager.createPreset({
        name: 'New Preset',
        description: 'Test',
        config: {},
      })

      const statsAfter = manager.getStats()
      expect(statsAfter.totalPresets).toBe(statsBefore.totalPresets + 1)
    })
  })

  describe('duplicatePreset', () => {
    it('should duplicate existing preset', () => {
      const duplicate = manager.duplicatePreset('minimal', 'Minimal Copy')

      expect(duplicate.id).toBe('minimal-copy')
      expect(duplicate.name).toBe('Minimal Copy')
      expect(duplicate.description).toContain('Copy of')
      expect(duplicate.config).toEqual(manager.getPreset('minimal')?.config)
      expect(duplicate.isBuiltIn).toBe(false)
    })

    it('should throw error for non-existent preset', () => {
      expect(() => manager.duplicatePreset('non-existent', 'Copy')).toThrow(
        'Preset non-existent not found',
      )
    })
  })

  describe('getRecommendedPresets', () => {
    it('should recommend CI preset in CI environment', () => {
      process.env.CI = 'true'

      const recommendations = manager.getRecommendedPresets('/project')

      expect(recommendations.some((p) => p.id === 'ci-friendly')).toBe(true)

      delete process.env.CI
    })

    it('should recommend team preset for git repositories', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => path.toString().includes('.git'))

      const recommendations = manager.getRecommendedPresets('/project')

      expect(recommendations.some((p) => p.id === 'team-collab')).toBe(true)
    })

    it('should recommend cautious preset for projects with tests', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) =>
        path.toString().includes('package.json'),
      )
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          scripts: {
            test: 'vitest',
          },
        }),
      )

      const recommendations = manager.getRecommendedPresets('/project')

      expect(recommendations.some((p) => p.id === 'cautious')).toBe(true)
    })

    it('should recommend minimal preset as default', () => {
      const recommendations = manager.getRecommendedPresets('/project')

      expect(recommendations.some((p) => p.id === 'minimal')).toBe(true)
    })
  })
})
