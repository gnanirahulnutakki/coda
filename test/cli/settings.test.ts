import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handleSettingsCommand } from '../../src/cli/settings.js'
import { SettingsManager } from '../../src/features/settings-manager.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('../../src/features/settings-manager.js')
vi.mock('../../src/config/paths.js')
vi.mock('fs')

describe('handleSettingsCommand', () => {
  let mockManager: any
  let mockConsoleLog: any
  let mockConsoleError: any

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockManager = {
      exportBundle: vi.fn().mockReturnValue({
        version: '1.0',
        created: new Date().toISOString(),
        settings: { configs: {}, presets: [], memory: [], checkpoints: [] },
        metadata: { totalSize: 1024, itemCount: 5 },
      }),
      importBundle: vi.fn().mockReturnValue({
        imported: { configs: 1, presets: 2, memory: 3, checkpoints: 1 },
        skipped: { configs: 0, presets: 1, memory: 0, checkpoints: 0 },
        errors: [],
      }),
      validateBundle: vi.fn().mockReturnValue({ isValid: true, errors: [], warnings: [] }),
      backup: vi.fn(),
      restore: vi.fn().mockReturnValue({ restored: 5, failed: 0 }),
      listBackups: vi.fn().mockReturnValue([
        { id: 'backup1', created: '2024-01-01T00:00:00Z', size: 1024, reason: 'manual' },
        { id: 'backup2', created: '2024-01-02T00:00:00Z', size: 2048, reason: 'auto' },
      ]),
      getBackupInfo: vi.fn().mockReturnValue({
        id: 'backup1',
        created: '2024-01-01T00:00:00Z',
        size: 1024,
        itemCount: 10,
        version: '1.0',
      }),
      cleanup: vi.fn().mockReturnValue({ removed: 3, freed: 3072 }),
    }

    vi.mocked(SettingsManager).mockImplementation(() => mockManager)
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue('/test/config')
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

      expect(mockManager.exportBundle).toHaveBeenCalledWith('/test/export.bundle', {})
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Settings exported successfully'),
      )
    })

    it('should export with includes option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--include=configs,presets'])

      expect(mockManager.exportBundle).toHaveBeenCalledWith('/test/export.bundle', {
        includes: ['configs', 'presets'],
      })
    })

    it('should export with excludes option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--exclude=memory,checkpoints'])

      expect(mockManager.exportBundle).toHaveBeenCalledWith('/test/export.bundle', {
        excludes: ['memory', 'checkpoints'],
      })
    })

    it('should export with encrypt option', async () => {
      await handleSettingsCommand(['export', '/test/export.bundle', '--encrypt=mypassword'])

      expect(mockManager.exportBundle).toHaveBeenCalledWith('/test/export.bundle', {
        password: 'mypassword',
      })
    })

    it('should handle export errors', async () => {
      mockManager.exportBundle.mockRejectedValue(new Error('Export failed'))

      await handleSettingsCommand(['export', '/test/export.bundle'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to export settings'),
      )
    })
  })

  describe('import command', () => {
    it('should import settings bundle', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockManager.importBundle).toHaveBeenCalledWith('/test/import.bundle', {})
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Settings imported successfully'),
      )
    })

    it('should import with decrypt option', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle', '--decrypt=mypassword'])

      expect(mockManager.importBundle).toHaveBeenCalledWith('/test/import.bundle', {
        password: 'mypassword',
      })
    })

    it('should import with force option', async () => {
      await handleSettingsCommand(['import', '/test/import.bundle', '--force'])

      expect(mockManager.importBundle).toHaveBeenCalledWith('/test/import.bundle', {
        force: true,
      })
    })

    it('should handle import errors', async () => {
      mockManager.importBundle.mockRejectedValue(new Error('Import failed'))

      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to import settings'),
      )
    })

    it('should show import errors and warnings', async () => {
      mockManager.importBundle.mockReturnValue({
        imported: { configs: 1, presets: 0, memory: 0, checkpoints: 0 },
        skipped: { configs: 0, presets: 0, memory: 0, checkpoints: 0 },
        errors: ['Invalid preset format', 'Corrupted memory entry'],
      })

      await handleSettingsCommand(['import', '/test/import.bundle'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Import completed with errors:'),
      )
    })
  })

  describe('validate command', () => {
    it('should validate settings bundle', async () => {
      await handleSettingsCommand(['validate', '/test/validate.bundle'])

      expect(mockManager.validateBundle).toHaveBeenCalledWith('/test/validate.bundle', {})
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ Bundle is valid'))
    })

    it('should show validation errors', async () => {
      mockManager.validateBundle.mockReturnValue({
        isValid: false,
        errors: ['Missing version field', 'Invalid settings format'],
        warnings: ['Old format detected'],
      })

      await handleSettingsCommand(['validate', '/test/validate.bundle'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Bundle validation failed'),
      )
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Missing version field'),
      )
    })

    it('should validate with decrypt option', async () => {
      await handleSettingsCommand(['validate', '/test/validate.bundle', '--decrypt=mypassword'])

      expect(mockManager.validateBundle).toHaveBeenCalledWith('/test/validate.bundle', {
        password: 'mypassword',
      })
    })
  })

  describe('backup command', () => {
    it('should create backup', async () => {
      await handleSettingsCommand(['backup'])

      expect(mockManager.backup).toHaveBeenCalledWith({ reason: 'manual' })
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Backup created successfully'),
      )
    })

    it('should create backup with reason', async () => {
      await handleSettingsCommand(['backup', '--reason=Before major update'])

      expect(mockManager.backup).toHaveBeenCalledWith({ reason: 'Before major update' })
    })

    it('should handle backup errors', async () => {
      mockManager.backup.mockRejectedValue(new Error('Backup failed'))

      await handleSettingsCommand(['backup'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to create backup'),
      )
    })
  })

  describe('restore command', () => {
    it('should restore from backup', async () => {
      await handleSettingsCommand(['restore', 'backup1'])

      expect(mockManager.restore).toHaveBeenCalledWith('backup1', {})
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Restore completed successfully'),
      )
    })

    it('should restore with force option', async () => {
      await handleSettingsCommand(['restore', 'backup1', '--force'])

      expect(mockManager.restore).toHaveBeenCalledWith('backup1', { force: true })
    })

    it('should handle restore errors', async () => {
      mockManager.restore.mockRejectedValue(new Error('Restore failed'))

      await handleSettingsCommand(['restore', 'backup1'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to restore backup'),
      )
    })
  })

  describe('backups command', () => {
    it('should list backups', async () => {
      await handleSettingsCommand(['backups'])

      expect(mockManager.listBackups).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Available Backups:'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('backup1'))
    })

    it('should show message when no backups', async () => {
      mockManager.listBackups.mockReturnValue([])

      await handleSettingsCommand(['backups'])

      expect(mockConsoleLog).toHaveBeenCalledWith('No backups found')
    })
  })

  describe('info command', () => {
    it('should show backup info', async () => {
      await handleSettingsCommand(['info', 'backup1'])

      expect(mockManager.getBackupInfo).toHaveBeenCalledWith('backup1')
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Backup Information:'))
    })

    it('should handle info errors', async () => {
      mockManager.getBackupInfo.mockRejectedValue(new Error('Backup not found'))

      await handleSettingsCommand(['info', 'backup1'])

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed to get backup info'),
      )
    })
  })

  describe('cleanup command', () => {
    it('should cleanup old backups', async () => {
      await handleSettingsCommand(['cleanup'])

      expect(mockManager.cleanup).toHaveBeenCalledWith({})
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ Cleanup completed'))
    })

    it('should cleanup with days option', async () => {
      await handleSettingsCommand(['cleanup', '--days=7'])

      expect(mockManager.cleanup).toHaveBeenCalledWith({ olderThanDays: 7 })
    })

    it('should cleanup with keep option', async () => {
      await handleSettingsCommand(['cleanup', '--keep=5'])

      expect(mockManager.cleanup).toHaveBeenCalledWith({ keepCount: 5 })
    })
  })
})
