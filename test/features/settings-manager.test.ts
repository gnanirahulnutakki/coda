import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { SettingsManager } from '../../src/features/settings-manager.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'
import { appConfigSchema } from '../../src/config/schemas.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')
vi.mock('../../src/config/loader.js')

describe('SettingsManager', () => {
  let manager: SettingsManager
  const mockConfigDir = '/test/.coda'
  const mockConfig = {
    provider: 'claude-code',
    yolo: false,
    show_notifications: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])
    vi.mocked(fs.statSync).mockReturnValue({
      size: 1024,
      birthtime: new Date(),
    } as any)

    manager = new SettingsManager()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('exportSettings', () => {
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') {
          return 'provider: claude-code\nyolo: false\nshow_notifications: true'
        }
        return ''
      })
    })

    it('should export settings to bundle file', async () => {
      await manager.exportSettings('/test/export.json')

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/export.json',
        expect.stringContaining('"version": "1.0.0"'),
      )

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const exportedContent = writeCalls[0][1] as string
      const bundle = JSON.parse(exportedContent)

      expect(bundle.version).toBe('1.0.0')
      expect(bundle.exported).toBeDefined()
      expect(bundle.checksum).toBeDefined()
      expect(bundle.config).toMatchObject(mockConfig)
      expect(bundle.metadata).toBeDefined()
    })

    it('should include presets when requested', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') return true
        if (path === '/test/.coda/presets') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['custom-preset.yaml'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('config.yaml')) {
          return 'provider: claude-code'
        }
        if (path.toString().includes('custom-preset.yaml')) {
          return 'id: custom-preset\nname: Custom Preset\nconfig:\n  yolo: true'
        }
        return ''
      })

      await manager.exportSettings('/test/export.json', { includePresets: true })

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const exportedContent = writeCalls[0][1] as string
      const bundle = JSON.parse(exportedContent)

      expect(bundle.presets).toBeDefined()
      expect(bundle.presets).toHaveLength(1)
      expect(bundle.presets[0]).toMatchObject({
        id: 'custom-preset',
        name: 'Custom Preset',
      })
    })

    it('should include workflows when requested', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') return true
        if (path === '/test/.coda/workflows') return true
        return false
      })

      vi.mocked(fs.readdirSync).mockReturnValue(['test-workflow.yaml'] as any)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('config.yaml')) {
          return 'provider: claude-code'
        }
        if (path.toString().includes('test-workflow.yaml')) {
          return 'id: test-workflow\nname: Test Workflow'
        }
        return ''
      })

      await manager.exportSettings('/test/export.json', { includeWorkflows: true })

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const exportedContent = writeCalls[0][1] as string
      const bundle = JSON.parse(exportedContent)

      expect(bundle.workflows).toBeDefined()
      expect(bundle.workflows).toHaveLength(1)
    })

    it('should add description to metadata', async () => {
      await manager.exportSettings('/test/export.json', {
        description: 'Test export',
      })

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const exportedContent = writeCalls[0][1] as string
      const bundle = JSON.parse(exportedContent)

      expect(bundle.metadata.description).toBe('Test export')
    })
  })

  describe('importSettings', () => {
    const validBundle = {
      version: '1.0.0',
      exported: new Date().toISOString(),
      checksum: '',
      config: {
        provider: 'gemini',
        yolo: true,
        show_notifications: false,
      },
    }

    beforeEach(() => {
      // Calculate proper checksum
      const bundleWithoutChecksum = { ...validBundle, checksum: '' }
      const checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(bundleWithoutChecksum, null, 2))
        .digest('hex')
      validBundle.checksum = checksum

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBundle))
    })

    it('should import settings from bundle', async () => {
      const result = await manager.importSettings('/test/import.json')

      expect(result.success).toBe(true)
      expect(result.imported.config).toBe(true)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/.coda/config.yaml',
        expect.stringContaining('provider: gemini'),
      )
    })

    it('should verify checksum by default', async () => {
      const invalidBundle = { ...validBundle, checksum: 'invalid-checksum' }
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBundle))

      const result = await manager.importSettings('/test/import.json')

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Checksum verification failed. Bundle may be corrupted.')
    })

    it('should skip checksum validation when requested', async () => {
      const invalidBundle = { ...validBundle, checksum: 'invalid-checksum' }
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBundle))

      const result = await manager.importSettings('/test/import.json', {
        validate: false,
      })

      expect(result.success).toBe(true)
      expect(result.imported.config).toBe(true)
    })

    it('should merge with existing config when requested', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') return true
        return false
      })

      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/test/import.json') {
          return JSON.stringify(validBundle)
        }
        if (path === '/test/.coda/config.yaml') {
          return 'provider: claude-code\ndebug: true'
        }
        return ''
      })

      const result = await manager.importSettings('/test/import.json', {
        merge: true,
      })

      expect(result.success).toBe(true)

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls
      const configWrite = writeCalls.find((call) => call[0].toString().includes('config.yaml'))
      const writtenConfig = configWrite![1] as string

      expect(writtenConfig).toContain('provider: gemini') // From import
      expect(writtenConfig).toContain('debug: true') // From existing
    })

    it('should import presets when included', async () => {
      const bundleWithPresets = {
        ...validBundle,
        presets: [
          {
            id: 'imported-preset',
            name: 'Imported Preset',
            config: { yolo: true },
          },
        ],
      }

      // Recalculate checksum
      const bundleWithoutChecksum = { ...bundleWithPresets, checksum: '' }
      bundleWithPresets.checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(bundleWithoutChecksum, null, 2))
        .digest('hex')

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(bundleWithPresets))

      const result = await manager.importSettings('/test/import.json', {
        includePresets: true,
      })

      expect(result.success).toBe(true)
      expect(result.imported.presets).toBe(1)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/.coda/presets/imported-preset.yaml',
        expect.stringContaining('id: imported-preset'),
      )
    })
  })

  describe('backupSettings', () => {
    it('should create backup with timestamp', async () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/test/.coda/config.yaml') return true
        return false
      })

      vi.mocked(fs.readFileSync).mockReturnValue('provider: claude-code')

      const backupPath = await manager.backupSettings()

      expect(backupPath).toMatch(
        /settings-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/,
      )
      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/.coda/backups', { recursive: true })
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/settings-backup-.*\.json$/),
        expect.any(String),
      )
    })
  })

  describe('listBackups', () => {
    it('should list available backups', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readdirSync).mockReturnValue([
        'settings-backup-2024-01-01T12-00-00-000Z.json',
        'settings-backup-2024-01-02T12-00-00-000Z.json',
        'other-file.txt',
      ] as any)

      vi.mocked(fs.statSync).mockImplementation(
        (path) =>
          ({
            size: 2048,
            birthtime: new Date('2024-01-01'),
          }) as any,
      )

      const backups = manager.listBackups()

      expect(backups).toHaveLength(2)
      expect(backups[0].filename).toContain('settings-backup-')
      expect(backups[0].size).toBe(2048)
    })

    it('should return empty array when no backups exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const backups = manager.listBackups()

      expect(backups).toEqual([])
    })
  })

  describe('validateBundle', () => {
    it('should validate valid bundle', () => {
      const validBundle = {
        version: '1.0.0',
        exported: new Date().toISOString(),
        checksum: 'abc123',
        config: {
          provider: 'claude-code',
          yolo: false,
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validBundle))

      const result = manager.validateBundle('/test/bundle.json')

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should detect missing version', () => {
      const invalidBundle = {
        exported: new Date().toISOString(),
        config: {},
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBundle))

      const result = manager.validateBundle('/test/bundle.json')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Missing version field')
    })

    it('should detect invalid configuration', () => {
      const invalidBundle = {
        version: '1.0.0',
        config: {
          provider: 'invalid-provider',
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidBundle))

      const result = manager.validateBundle('/test/bundle.json')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid configuration'))).toBe(true)
    })

    it('should warn about platform differences', () => {
      const bundle = {
        version: '1.0.0',
        config: {},
        metadata: {
          platform: process.platform === 'darwin' ? 'win32' : 'darwin',
        },
      }

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(bundle))

      const result = manager.validateBundle('/test/bundle.json')

      expect(result.valid).toBe(true)
      expect(result.warnings.some((w) => w.includes('Bundle was exported on'))).toBe(true)
    })
  })

  describe('restoreBackup', () => {
    it('should restore from backup file', async () => {
      const backupBundle = {
        version: '1.0.0',
        exported: new Date().toISOString(),
        checksum: '',
        config: {
          provider: 'claude-code',
          yolo: false,
        },
      }

      // Calculate checksum
      const bundleWithoutChecksum = { ...backupBundle, checksum: '' }
      backupBundle.checksum = crypto
        .createHash('sha256')
        .update(JSON.stringify(bundleWithoutChecksum, null, 2))
        .digest('hex')

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(backupBundle))

      const result = await manager.restoreBackup('/test/backup.json')

      expect(result.success).toBe(true)
      expect(result.imported.config).toBe(true)
    })

    it('should throw error if backup not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(manager.restoreBackup('/test/missing.json')).rejects.toThrow(
        'Backup file not found',
      )
    })
  })
})
