import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as readline from 'readline'
import { ConfigWizard } from '../../src/features/config-wizard.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'
import { PresetManager } from '../../src/features/preset-manager.js'

vi.mock('fs')
vi.mock('readline')
vi.mock('../../src/config/paths.js')
vi.mock('../../src/features/preset-manager.js')

describe('ConfigWizard', () => {
  let wizard: ConfigWizard
  let mockRl: any
  let mockPresetManager: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock readline interface
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    }

    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any)

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue('/test/.coda')

    // Mock fs
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

    // Mock PresetManager
    mockPresetManager = {
      getPreset: vi.fn(),
      createFromCurrent: vi.fn(),
      getPresets: vi.fn().mockReturnValue([]),
    }

    vi.mocked(PresetManager).mockImplementation(() => mockPresetManager)

    wizard = new ConfigWizard()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('runWizard', () => {
    it('should use defaults when useDefaults is true', async () => {
      const config = await wizard.runWizard({ useDefaults: true })

      expect(config).toMatchObject({
        provider: 'claude-code',
        yolo: false,
        show_notifications: true,
        sticky_notifications: false,
        quiet: false,
        allow_buffer_snapshots: false,
        log_all_pattern_matches: false,
        debug: false,
        dangerously_allow_in_dirty_directory: false,
        dangerously_allow_without_version_control: false,
        dangerously_suppress_yolo_confirmation: false,
      })

      expect(mockRl.question).not.toHaveBeenCalled()
    })

    it('should use preset configuration when specified', async () => {
      const mockPreset = {
        id: 'productive',
        name: 'Productive',
        description: 'Optimized for productivity',
        category: 'workflow',
        tags: ['yolo'],
        config: {
          yolo: true,
          show_notifications: false,
          dangerously_suppress_yolo_confirmation: true,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      mockPresetManager.getPreset.mockReturnValue(mockPreset)

      const config = await wizard.runWizard({
        useDefaults: true,
        preset: 'productive',
      })

      expect(mockPresetManager.getPreset).toHaveBeenCalledWith('productive')
      expect(config.yolo).toBe(true)
      expect(config.show_notifications).toBe(false)
      expect(config.dangerously_suppress_yolo_confirmation).toBe(true)
    })

    it('should run interactive wizard when interactive is true', async () => {
      // Simulate user responses
      const responses = [
        '1', // Provider: claude-code
        'y', // Enable YOLO: yes
        'n', // Suppress YOLO confirmation: no
        'n', // Allow dirty directory: no
        'n', // Allow without version control: no
        'y', // Show notifications: yes
        'n', // Sticky notifications: no
        'n', // Quiet mode: no
        'n', // Advanced settings: no
        'n', // Save as preset: no
      ]

      let responseIndex = 0
      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      const config = await wizard.runWizard({ interactive: true })

      expect(mockRl.question).toHaveBeenCalled()
      expect(config.provider).toBe('claude-code')
      expect(config.yolo).toBe(true)
      expect(config.dangerously_suppress_yolo_confirmation).toBe(false)
      expect(config.show_notifications).toBe(true)
      expect(mockRl.close).toHaveBeenCalled()
    })

    it('should handle advanced settings in interactive mode', async () => {
      const responses = [
        '1', // Provider
        'n', // YOLO mode
        'n', // Dirty directory
        'n', // Without version control
        'y', // Show notifications
        'n', // Sticky notifications
        'n', // Quiet mode
        'y', // Advanced settings: YES
        'y', // Buffer snapshots: yes
        'y', // Log pattern matches: yes
        'y', // Debug mode: yes
        'n', // Configure paths: no
        'n', // Save as preset: no
      ]

      let responseIndex = 0
      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      const config = await wizard.runWizard({ interactive: true })

      expect(config.allow_buffer_snapshots).toBe(true)
      expect(config.log_all_pattern_matches).toBe(true)
      expect(config.debug).toBe(true)
    })

    it('should save configuration as preset when requested', async () => {
      const responses = [
        '1', // Provider
        'n', // YOLO mode
        'n', // Dirty directory
        'n', // Without version control
        'y', // Show notifications
        'n', // Sticky notifications
        'n', // Quiet mode
        'n', // Advanced settings
        'y', // Save as preset: YES
        'My Config', // Preset name
        'Test preset', // Description
      ]

      let responseIndex = 0
      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      mockPresetManager.createFromCurrent.mockResolvedValue({
        id: 'my-config',
        name: 'My Config',
      })

      await wizard.runWizard({ interactive: true })

      expect(mockPresetManager.createFromCurrent).toHaveBeenCalledWith(
        'My Config',
        'Test preset',
        expect.objectContaining({
          category: 'custom',
          tags: ['wizard'],
        }),
      )
    })
  })

  describe('saveConfig', () => {
    it('should save configuration to default path', async () => {
      const config = {
        provider: 'claude-code',
        yolo: false,
        show_notifications: true,
      }

      const savedPath = await wizard.saveConfig(config as any)

      expect(savedPath).toBe('/test/.coda/config.yaml')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/test/.coda/config.yaml',
        expect.stringContaining('provider: claude-code'),
      )
    })

    it('should save configuration to custom path', async () => {
      const config = {
        provider: 'gemini',
        yolo: true,
      }

      const savedPath = await wizard.saveConfig(config as any, '/custom/path/config.yaml')

      expect(savedPath).toBe('/custom/path/config.yaml')
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/custom/path/config.yaml',
        expect.stringContaining('provider: gemini'),
      )
    })

    it('should create directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const config = { provider: 'claude-code' }
      await wizard.saveConfig(config as any)

      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/.coda', { recursive: true })
    })
  })

  describe('getRecommendedPresets', () => {
    it('should recommend cautious preset for beginners', () => {
      const recommendations = wizard.getRecommendedPresets({
        experience: 'beginner',
      })

      expect(recommendations).toContain('cautious')
    })

    it('should recommend productive preset for experts', () => {
      const recommendations = wizard.getRecommendedPresets({
        experience: 'expert',
        workflow: 'fast',
      })

      expect(recommendations).toContain('productive')
    })

    it('should recommend team-collab for team environment', () => {
      const recommendations = wizard.getRecommendedPresets({
        environment: 'team',
      })

      expect(recommendations).toContain('team-collab')
    })

    it('should recommend ci-friendly for CI environment', () => {
      const recommendations = wizard.getRecommendedPresets({
        environment: 'ci',
      })

      expect(recommendations).toContain('ci-friendly')
    })

    it('should remove duplicate recommendations', () => {
      const recommendations = wizard.getRecommendedPresets({
        experience: 'beginner',
        workflow: 'careful',
      })

      // Both should recommend 'cautious', but only one should appear
      const cautiousCount = recommendations.filter((r) => r === 'cautious').length
      expect(cautiousCount).toBe(1)
    })

    it('should recommend minimal for balanced workflow', () => {
      const recommendations = wizard.getRecommendedPresets({
        workflow: 'balanced',
      })

      expect(recommendations).toContain('minimal')
    })
  })
})
