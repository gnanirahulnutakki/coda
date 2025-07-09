import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handlePresetCommand } from '../../src/cli/preset.js'
import { PresetManager } from '../../src/features/preset-manager.js'
import { loadConfigFile } from '../../src/config/loader.js'

vi.mock('../../src/features/preset-manager.js')
vi.mock('../../src/config/loader.js')

describe('handlePresetCommand', () => {
  let mockConsoleLog: any
  let mockConsoleError: any
  let mockProcessExit: any
  let mockManager: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console methods
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exited with code ${code}`)
    })

    // Mock PresetManager
    mockManager = {
      getPresets: vi.fn().mockReturnValue([]),
      getPreset: vi.fn().mockReturnValue(null),
      searchPresets: vi.fn().mockReturnValue([]),
      createPreset: vi.fn(),
      updatePreset: vi.fn(),
      deletePreset: vi.fn(),
      applyPreset: vi.fn(),
      createFromCurrent: vi.fn(),
      exportPreset: vi.fn(),
      importPreset: vi.fn(),
      toggleFavorite: vi.fn(),
      getFavorites: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        totalPresets: 0,
        categories: {},
        favorites: [],
      }),
      duplicatePreset: vi.fn(),
      getRecommendedPresets: vi.fn().mockReturnValue([]),
    }

    vi.mocked(PresetManager).mockImplementation(() => mockManager)
    vi.mocked(loadConfigFile).mockResolvedValue({})
  })

  afterEach(() => {
    mockConsoleLog.mockRestore()
    mockConsoleError.mockRestore()
    mockProcessExit.mockRestore()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handlePresetCommand([])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Preset Management'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Usage: coda preset <command>'),
      )
    })

    it('should display help for --help flag', async () => {
      await handlePresetCommand(['--help'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Preset Management'),
      )
    })

    it('should display help for help command', async () => {
      await handlePresetCommand(['help'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Preset Management'),
      )
    })
  })

  describe('list command', () => {
    it('should list all presets', async () => {
      const mockPresets = [
        {
          id: 'minimal',
          name: 'Minimal',
          description: 'Minimal configuration',
          category: 'general',
          tags: ['simple'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isBuiltIn: true,
        },
        {
          id: 'custom-1',
          name: 'My Custom',
          description: 'Custom config',
          category: 'custom',
          tags: ['custom'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isBuiltIn: false,
        },
      ]

      mockManager.getPresets.mockReturnValue(mockPresets)
      mockManager.getStats.mockReturnValue({
        totalPresets: 2,
        categories: { general: 1, custom: 1 },
        favorites: [],
        lastUsed: 'minimal',
      })

      await handlePresetCommand(['list'])

      expect(mockManager.getPresets).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Available Presets:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('General:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Custom:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('minimal'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('custom-1'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Total: 2 presets'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Last used: minimal'))
    })

    it('should filter presets by category', async () => {
      const mockPresets = [
        {
          id: 'minimal',
          name: 'Minimal',
          description: 'Minimal configuration',
          category: 'general',
          tags: [],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isBuiltIn: true,
        },
      ]

      mockManager.getPresets.mockReturnValue(mockPresets)

      await handlePresetCommand(['list', 'general'])

      expect(mockManager.getPresets).toHaveBeenCalledWith('general')
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('minimal'))
    })

    it('should handle empty preset list', async () => {
      mockManager.getPresets.mockReturnValue([])

      await handlePresetCommand(['list'])

      expect(mockConsoleLog).toHaveBeenCalledWith('No presets found.')
    })
  })

  describe('show command', () => {
    it('should show preset details', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: ['simple', 'basic'],
        config: { yolo: false, debug: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Test Author',
        isBuiltIn: true,
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.getStats.mockReturnValue({
        totalPresets: 1,
        categories: { general: 1 },
        favorites: ['minimal'],
      })

      await handlePresetCommand(['show', 'minimal'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Preset: Minimal (minimal)'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Category: general'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Description: Minimal configuration'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Tags: simple, basic'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Author: Test Author'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Type: Built-in'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Configuration:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('yolo: false'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('⭐ This preset is in your favorites'),
      )
    })

    it('should error when no ID provided', async () => {
      await expect(handlePresetCommand(['show'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset show <id>')
    })

    it('should error when preset not found', async () => {
      mockManager.getPreset.mockReturnValue(null)

      await expect(handlePresetCommand(['show', 'non-existent'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith("Error: Preset 'non-existent' not found")
    })
  })

  describe('apply command', () => {
    it('should apply preset', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: { yolo: false, debug: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.applyPreset.mockResolvedValue(undefined)

      await handlePresetCommand(['apply', 'minimal'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('minimal')
      expect(mockManager.applyPreset).toHaveBeenCalledWith('minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith('Applying preset: Minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith('✓ Preset applied successfully')
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Applied configuration:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('yolo: false'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Restart your session for changes to take effect.'),
      )
    })

    it('should error when no ID provided', async () => {
      await expect(handlePresetCommand(['apply'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset apply <id>')
    })

    it('should error when preset not found', async () => {
      mockManager.getPreset.mockReturnValue(null)

      await expect(handlePresetCommand(['apply', 'non-existent'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith("Error: Preset 'non-existent' not found")
    })
  })

  describe('create command', () => {
    it('should create new preset with default options', async () => {
      const mockPreset = {
        id: 'my-preset',
        name: 'My Preset',
        description: 'Custom preset created on ' + new Date().toLocaleDateString(),
        category: 'custom',
        tags: [],
        config: { yolo: true },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.createFromCurrent.mockResolvedValue(mockPreset)

      await handlePresetCommand(['create', 'My Preset'])

      expect(mockManager.createFromCurrent).toHaveBeenCalledWith(
        'My Preset',
        expect.stringContaining('Custom preset created on'),
        { category: 'custom', tags: [], author: undefined },
      )
      expect(mockConsoleLog).toHaveBeenCalledWith('Creating preset from current configuration...')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Preset 'my-preset' created successfully")
    })

    it('should create preset with custom options', async () => {
      const mockPreset = {
        id: 'team-config',
        name: 'Team Config',
        description: 'Team configuration',
        category: 'project',
        tags: ['team', 'shared'],
        config: { yolo: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'John Doe',
      }

      mockManager.createFromCurrent.mockResolvedValue(mockPreset)

      await handlePresetCommand([
        'create',
        'Team Config',
        '--description',
        'Team configuration',
        '--category',
        'project',
        '--tags',
        'team,shared',
        '--author',
        'John Doe',
      ])

      expect(mockManager.createFromCurrent).toHaveBeenCalledWith(
        'Team Config',
        'Team configuration',
        {
          category: 'project',
          tags: ['team', 'shared'],
          author: 'John Doe',
        },
      )
    })

    it('should error when no name provided', async () => {
      await expect(handlePresetCommand(['create'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset name required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset create <name> [options]')
    })
  })

  describe('update command', () => {
    it('should update existing preset', async () => {
      const mockPreset = {
        id: 'custom-1',
        name: 'Custom',
        description: 'Original',
        category: 'custom',
        tags: [],
        config: { yolo: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: false,
      }

      const updatedPreset = {
        ...mockPreset,
        config: { yolo: true, debug: true },
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.updatePreset.mockReturnValue(updatedPreset)
      vi.mocked(loadConfigFile).mockResolvedValue({ yolo: true, debug: true })

      await handlePresetCommand(['update', 'custom-1'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('custom-1')
      expect(mockManager.updatePreset).toHaveBeenCalledWith('custom-1', {
        config: { yolo: true, debug: true },
      })
      expect(mockConsoleLog).toHaveBeenCalledWith('Updating preset from current configuration...')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Preset 'custom-1' updated successfully")
    })

    it('should error when updating built-in preset', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      }

      mockManager.getPreset.mockReturnValue(mockPreset)

      await expect(handlePresetCommand(['update', 'minimal'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Cannot modify built-in presets')
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Tip: Use "coda preset duplicate" to create a customizable copy',
      )
    })

    it('should error when no ID provided', async () => {
      await expect(handlePresetCommand(['update'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset update <id>')
    })
  })

  describe('delete command', () => {
    it('should delete custom preset', async () => {
      const mockPreset = {
        id: 'custom-1',
        name: 'Custom',
        description: 'Custom preset',
        category: 'custom',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: false,
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.deletePreset.mockReturnValue(true)

      await handlePresetCommand(['delete', 'custom-1'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('custom-1')
      expect(mockManager.deletePreset).toHaveBeenCalledWith('custom-1')
      expect(mockConsoleLog).toHaveBeenCalledWith('This will delete preset: Custom')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Preset 'custom-1' deleted successfully")
    })

    it('should error when deleting built-in preset', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      }

      mockManager.getPreset.mockReturnValue(mockPreset)

      await expect(handlePresetCommand(['delete', 'minimal'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Cannot delete built-in presets')
    })

    it('should error when no ID provided', async () => {
      await expect(handlePresetCommand(['delete'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset delete <id>')
    })
  })

  describe('duplicate command', () => {
    it('should duplicate preset', async () => {
      const originalPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: ['simple'],
        config: { yolo: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      }

      const duplicatedPreset = {
        id: 'my-minimal',
        name: 'My Minimal',
        description: 'Copy of Minimal configuration',
        category: 'general',
        tags: ['simple'],
        config: { yolo: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: false,
      }

      mockManager.getPreset.mockReturnValue(originalPreset)
      mockManager.duplicatePreset.mockReturnValue(duplicatedPreset)

      await handlePresetCommand(['duplicate', 'minimal', 'My Minimal'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('minimal')
      expect(mockManager.duplicatePreset).toHaveBeenCalledWith('minimal', 'My Minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith('Duplicating preset: Minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Created duplicate preset 'my-minimal'")
    })

    it('should error when missing parameters', async () => {
      await expect(handlePresetCommand(['duplicate', 'minimal'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID and new name required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset duplicate <id> <new-name>')
    })
  })

  describe('import command', () => {
    it('should import preset from file', async () => {
      const importedPreset = {
        id: 'imported',
        name: 'Imported Preset',
        description: 'Imported from file',
        category: 'custom',
        tags: [],
        config: { yolo: true },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.importPreset.mockReturnValue(importedPreset)

      await handlePresetCommand(['import', '/path/to/preset.yaml'])

      expect(mockManager.importPreset).toHaveBeenCalledWith('/path/to/preset.yaml')
      expect(mockConsoleLog).toHaveBeenCalledWith('Importing preset from: /path/to/preset.yaml')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Preset 'imported' imported successfully")
    })

    it('should handle import errors', async () => {
      mockManager.importPreset.mockImplementation(() => {
        throw new Error('Invalid file format')
      })

      await expect(handlePresetCommand(['import', '/path/to/invalid.yaml'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith('Error importing preset: Invalid file format')
    })

    it('should error when no file provided', async () => {
      await expect(handlePresetCommand(['import'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Import file required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset import <file>')
    })
  })

  describe('export command', () => {
    it('should export preset to file', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: { yolo: false },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.exportPreset.mockReturnValue(undefined)

      await handlePresetCommand(['export', 'minimal', '/path/to/export.yaml'])

      expect(mockManager.getPreset).toHaveBeenCalledWith('minimal')
      expect(mockManager.exportPreset).toHaveBeenCalledWith('minimal', '/path/to/export.yaml')
      expect(mockConsoleLog).toHaveBeenCalledWith('Exporting preset: Minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith('✓ Preset exported to: /path/to/export.yaml')
    })

    it('should handle export errors', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.exportPreset.mockImplementation(() => {
        throw new Error('Write permission denied')
      })

      await expect(
        handlePresetCommand(['export', 'minimal', '/restricted/path.yaml']),
      ).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error exporting preset: Write permission denied',
      )
    })

    it('should error when missing parameters', async () => {
      await expect(handlePresetCommand(['export', 'minimal'])).rejects.toThrow(
        'Process exited with code 1',
      )

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID and output file required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset export <id> <file>')
    })
  })

  describe('search command', () => {
    it('should search presets', async () => {
      const searchResults = [
        {
          id: 'debug',
          name: 'Debug Mode',
          description: 'Verbose logging and debugging',
          category: 'general',
          tags: ['debug', 'verbose'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ]

      mockManager.searchPresets.mockReturnValue(searchResults)

      await handlePresetCommand(['search', 'debug'])

      expect(mockManager.searchPresets).toHaveBeenCalledWith('debug')
      expect(mockConsoleLog).toHaveBeenCalledWith(`\nFound 1 preset(s) matching "debug":\n`)
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('debug'))
    })

    it('should handle multi-word queries', async () => {
      mockManager.searchPresets.mockReturnValue([])

      await handlePresetCommand(['search', 'team', 'collaboration'])

      expect(mockManager.searchPresets).toHaveBeenCalledWith('team collaboration')
      expect(mockConsoleLog).toHaveBeenCalledWith('No presets found matching: team collaboration')
    })

    it('should error when no query provided', async () => {
      await expect(handlePresetCommand(['search'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Search query required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset search <query>')
    })
  })

  describe('favorite command', () => {
    it('should add preset to favorites', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.toggleFavorite.mockReturnValue(true)

      await handlePresetCommand(['favorite', 'minimal'])

      expect(mockManager.toggleFavorite).toHaveBeenCalledWith('minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith("⭐ Added 'Minimal' to favorites")
    })

    it('should remove preset from favorites', async () => {
      const mockPreset = {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration',
        category: 'general',
        tags: [],
        config: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockManager.getPreset.mockReturnValue(mockPreset)
      mockManager.toggleFavorite.mockReturnValue(false)

      await handlePresetCommand(['favorite', 'minimal'])

      expect(mockManager.toggleFavorite).toHaveBeenCalledWith('minimal')
      expect(mockConsoleLog).toHaveBeenCalledWith("✓ Removed 'Minimal' from favorites")
    })

    it('should error when no ID provided', async () => {
      await expect(handlePresetCommand(['favorite'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Preset ID required')
      expect(mockConsoleLog).toHaveBeenCalledWith('Usage: coda preset favorite <id>')
    })
  })

  describe('favorites command', () => {
    it('should list favorite presets', async () => {
      const favoritePresets = [
        {
          id: 'minimal',
          name: 'Minimal',
          description: 'Minimal configuration',
          category: 'general',
          tags: [],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isBuiltIn: true,
        },
        {
          id: 'productive',
          name: 'Productive',
          description: 'Optimized for productivity',
          category: 'workflow',
          tags: ['yolo'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          isBuiltIn: true,
        },
      ]

      mockManager.getFavorites.mockReturnValue(favoritePresets)

      await handlePresetCommand(['favorites'])

      expect(mockManager.getFavorites).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith('\n⭐ Favorite Presets:\n')
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('minimal'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('productive'))
    })

    it('should handle empty favorites list', async () => {
      mockManager.getFavorites.mockReturnValue([])

      await handlePresetCommand(['favorites'])

      expect(mockConsoleLog).toHaveBeenCalledWith('No favorite presets.')
      expect(mockConsoleLog).toHaveBeenCalledWith(
        'Use "coda preset favorite <id>" to add favorites.',
      )
    })
  })

  describe('recommend command', () => {
    it('should show recommendations', async () => {
      const recommendations = [
        {
          id: 'ci-friendly',
          name: 'CI/CD Friendly',
          description: 'Configuration for CI environments',
          category: 'workflow',
          tags: ['ci'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
        {
          id: 'team-collab',
          name: 'Team Collaboration',
          description: 'Balanced team settings',
          category: 'project',
          tags: ['team'],
          config: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ]

      mockManager.getRecommendedPresets.mockReturnValue(recommendations)

      // Mock environment
      process.env.CI = 'true'
      vi.spyOn(process, 'cwd').mockReturnValue('/project')

      await handlePresetCommand(['recommend'])

      expect(mockManager.getRecommendedPresets).toHaveBeenCalledWith('/project')
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 Recommended Presets for this Project:\n')
      expect(mockConsoleLog).toHaveBeenCalledWith('1. CI/CD Friendly')
      expect(mockConsoleLog).toHaveBeenCalledWith('   Configuration for CI environments')
      expect(mockConsoleLog).toHaveBeenCalledWith('   Use: coda preset apply ci-friendly')
      expect(mockConsoleLog).toHaveBeenCalledWith('ℹ️  CI environment detected')

      delete process.env.CI
    })

    it('should handle no recommendations', async () => {
      mockManager.getRecommendedPresets.mockReturnValue([])

      await handlePresetCommand(['recommend'])

      expect(mockConsoleLog).toHaveBeenCalledWith('No specific recommendations for this project.')
    })
  })

  describe('unknown command', () => {
    it('should show error and help for unknown command', async () => {
      await expect(handlePresetCommand(['unknown'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Unknown command: unknown')
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration Preset Management'),
      )
    })
  })

  describe('error handling', () => {
    it('should handle unexpected errors', async () => {
      mockManager.getPresets.mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      await expect(handlePresetCommand(['list'])).rejects.toThrow('Process exited with code 1')

      expect(mockConsoleError).toHaveBeenCalledWith('Unexpected error:', expect.any(Error))
    })
  })
})
