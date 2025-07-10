import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handleSettingsCommand } from '../../src/cli/settings.js'
import { SettingsManager } from '../../src/features/settings-manager.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'
import * as fs from 'fs'

vi.mock('../../src/features/settings-manager.js')
vi.mock('../../src/config/paths.js')
vi.mock('fs')

describe('handleSettingsCommand', () => {
  let mockManager: any
  let mockConsoleLog: any
  let mockConsoleError: any
  let mockConsoleInfo: any
  let mockConsoleWarn: any

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockManager = {
      exportSettings: vi.fn().mockResolvedValue(undefined),
      importSettings: vi.fn().mockResolvedValue({
        success: true,
        imported: { config: true, presets: 2, workflows: 1 },
        errors: [],
      }),
      validateBundle: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
      backupSettings: vi.fn().mockResolvedValue('/test/backup.json'),
      restoreBackup: vi.fn().mockResolvedValue({ 
        success: true, 
        imported: { config: true, presets: 2, workflows: 1 },
        errors: []
      }),
      listBackups: vi.fn().mockReturnValue([
        { filename: 'backup1.json', created: new Date('2024-01-01T00:00:00Z'), size: 1024, path: '/test/backup1.json' },
        { filename: 'backup2.json', created: new Date('2024-01-02T00:00:00Z'), size: 2048, path: '/test/backup2.json' },
      ]),
      cleanupBackups: vi.fn().mockReturnValue({ removed: 3, freed: 3072 }),
    }

    vi.mocked(SettingsManager).mockImplementation(() => mockManager)
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue('/test/config')
    
    // Mock fs methods
    vi.mocked(fs.statSync).mockReturnValue({
      size: 1024,
      isFile: () => true,
      isDirectory: () => false,
    } as any)
    vi.mocked(fs.existsSync).mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handleSettingsCommand([])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Settings Import/Export Management'),
      )
    })

    it('should display help with --help flag', async () => {
      await handleSettingsCommand(['--help'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Settings Import/Export Management'),
      )
    })
  })

  describe('export command', () => {
    it('should export settings bundle', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle'])

      expect(mockManager.exportSettings).toHaveBeenCalledWith('/test/export.bundle', {
        includePresets: true,
        includeWorkflows: true,
      })
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('✅ Settings exported successfully'),
      )
    })

    it('should export with includes option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--include=configs,presets'])

      expect(mockManager.exportSettings).toHaveBeenCalled()
    })

    it('should export with excludes option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--exclude=memory,checkpoints'])

      expect(mockManager.exportSettings).toHaveBeenCalled()
    })

    it('should export with encrypt option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--encrypt=mypassword'])

      expect(mockManager.exportSettings).toHaveBeenCalled()
    })

    it('should handle export errors', async () => {
      mockManager.exportSettings.mockRejectedValue(new Error('Export failed'))

      await handleSettingsCommand(['export', '/test/export.bundle'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to export settings'),
      )
    })
  })

  describe('import command', () => {
    it('should import settings bundle', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockManager.importSettings).toHaveBeenCalledWith('/test/import.bundle', expect.objectContaining({
        overwrite: false,
        merge: false,
        includePresets: true,
        includeWorkflows: true,
        validate: true,
      }))
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('✅ Settings imported successfully'),
      )
    })

    it('should import with decrypt option', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle', '--decrypt=mypassword'])

      expect(mockManager.importSettings).toHaveBeenCalled()
    })

    it('should import with force option', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle', '--force'])

      expect(mockManager.importSettings).toHaveBeenCalled()
    })

    it('should handle import errors', async () => {
      mockManager.importSettings.mockRejectedValue(new Error('Import failed'))

      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import settings'),
      )
    })

    it('should show import errors and warnings', async () => {
      mockManager.importSettings.mockResolvedValue({
        success: false,
        imported: { config: false, presets: 0, workflows: 0 },
        errors: ['Invalid preset format', 'Corrupted memory entry'],
      })

      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('❌ Import failed with errors:'),
      )
    })
  })

  describe('validate command', () => {
    it('should validate settings bundle', async () => {
      await handleSettingsCommand(['validate', '/test/validate.bundle'])

      expect(mockManager.validateBundle).toHaveBeenCalledWith('/test/validate.bundle')
      expect(mockConsoleInfo).toHaveBeenCalledWith(expect.stringContaining('✅ Bundle is valid'))
    })

    it('should show validation errors', async () => {
      mockManager.validateBundle.mockReturnValue({
        valid: false,
        errors: ['Missing version field', 'Invalid settings format'],
        warnings: ['Old format detected'],
      })

      await handleSettingsCommand(['validate', '/test/validate.bundle'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('❌ Bundle validation failed'),
      )
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Missing version field'),
      )
    })

    it('should validate with decrypt option', async () => {
      await handleSettingsCommand(['validate', '/test/validate.bundle', '--decrypt=mypassword'])

      expect(mockManager.validateBundle).toHaveBeenCalledWith('/test/validate.bundle')
    })
  })

  describe('backup command', () => {
    it('should create backup', async () => {
      await handleSettingsCommand(['backup'])

      expect(mockManager.backupSettings).toHaveBeenCalled()
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('✅ Backup created successfully'),
      )
    })

    it('should create backup with reason', async () => {
      await handleSettingsCommand(['backup', '--reason=Before major update'])

      expect(mockManager.backupSettings).toHaveBeenCalled()
    })

    it('should handle backup errors', async () => {
      mockManager.backupSettings.mockRejectedValue(new Error('Backup failed'))

      await handleSettingsCommand(['backup'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create backup'),
      )
    })
  })

  describe('restore command', () => {
    it('should restore from backup', async () => {
      await handleSettingsCommand(['restore', 'backup1.json'])

      expect(mockManager.restoreBackup).toHaveBeenCalled()
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('✅ Settings restored successfully'),
      )
    })

    it('should restore with force option', async () => {
      await handleSettingsCommand(['restore', 'backup1.json', '--force'])

      expect(mockManager.restoreBackup).toHaveBeenCalled()
    })

    it('should handle restore errors', async () => {
      mockManager.restoreBackup.mockRejectedValue(new Error('Restore failed'))

      await handleSettingsCommand(['restore', 'backup1.json'])

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore backup'),
      )
    })
  })

  describe('backups command', () => {
    it('should list backups', async () => {
      await handleSettingsCommand(['backups'])

      expect(mockManager.listBackups).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Available Backups'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('backup1.json'))
    })

    it('should show message when no backups', async () => {
      mockManager.listBackups.mockReturnValue([])

      await handleSettingsCommand(['backups'])

      expect(mockConsoleLog).toHaveBeenCalledWith('No backups found.')
    })
  })

  describe('unknown command', () => {
    let mockProcessExit: any

    beforeEach(() => {
      mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit unexpectedly called with "${code}"`)
      })
    })

    afterEach(() => {
      mockProcessExit.mockRestore()
    })

    it('should show error for unknown command', async () => {
      try {
        await handleSettingsCommand(['unknown'])
      } catch (error) {
        // Expected to throw from process.exit
      }

      expect(mockConsoleError).toHaveBeenCalledWith('Unknown command: unknown')
      expect(mockProcessExit).toHaveBeenCalledWith(1)
    })
  })
})
