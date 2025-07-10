import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { handleWizardCommand } from '../../src/cli/wizard.js'
import { ConfigWizard } from '../../src/features/config-wizard.js'
import { PresetManager } from '../../src/features/preset-manager.js'
import * as readline from 'readline'

vi.mock('../../src/features/config-wizard.js')
vi.mock('../../src/features/preset-manager.js')
vi.mock('readline')

describe('handleWizardCommand', () => {
  let mockWizard: any
  let mockConsoleLog: any
  let mockProcessExit: any
  let mockRl: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console methods
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exited with code ${code}`)
    })

    // Mock readline
    mockRl = {
      question: vi.fn((prompt: string, callback: (answer: string) => void) => {
        // Immediately call callback to avoid hanging
        if (prompt.includes('start an AI session')) {
          callback('n') // Don't start AI session in tests
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    }

    vi.mocked(readline).createInterface.mockReturnValue(mockRl as any)

    // Mock ConfigWizard
    mockWizard = {
      runWizard: vi.fn().mockResolvedValue({
        provider: 'claude-code',
        yolo: false,
        show_notifications: true,
      }),
      saveConfig: vi.fn().mockResolvedValue('/test/.coda/config.yaml'),
      getRecommendedPresets: vi.fn().mockReturnValue(['minimal', 'cautious']),
    }

    vi.mocked(ConfigWizard).mockImplementation(() => mockWizard)

    // Mock PresetManager
    const mockPresetManager = {
      getPreset: vi.fn().mockImplementation((id) => {
        const presets: Record<string, any> = {
          minimal: {
            id: 'minimal',
            name: 'Minimal',
            description: 'Minimal configuration',
            category: 'general',
            tags: [],
          },
          cautious: {
            id: 'cautious',
            name: 'Cautious',
            description: 'Maximum safety',
            category: 'security',
            tags: [],
          },
        }
        return presets[id] || null
      }),
    }

    vi.mocked(PresetManager).mockImplementation(() => mockPresetManager)
  })

  afterEach(() => {
    mockConsoleLog.mockRestore()
    mockProcessExit.mockRestore()
  })

  describe('help command', () => {
    it('should display help when --help is provided', async () => {
      await handleWizardCommand(['--help'])

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Configuration Wizard'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Usage: coda wizard'))
    })

    it('should display help when -h is provided', async () => {
      await handleWizardCommand(['-h'])

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Configuration Wizard'))
    })
  })

  describe('wizard execution', () => {
    it('should run wizard with defaults', async () => {
      await handleWizardCommand(['--defaults'])

      expect(mockWizard.runWizard).toHaveBeenCalledWith({
        interactive: false,
        useDefaults: true,
        preset: undefined,
      })

      expect(mockWizard.saveConfig).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration saved to:'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚀 You can now use Coda'),
      )
    })

    it('should run interactive wizard by default', async () => {
      await handleWizardCommand([])

      expect(mockWizard.runWizard).toHaveBeenCalledWith({
        interactive: true,
        useDefaults: false,
        preset: undefined,
      })
      
      expect(mockWizard.saveConfig).toHaveBeenCalled()
      expect(mockRl.question).toHaveBeenCalledWith(
        expect.stringContaining('Would you like to start an AI session'),
        expect.any(Function)
      )
      expect(mockRl.close).toHaveBeenCalled()
    })

    it('should run wizard with preset', async () => {
      await handleWizardCommand(['--preset', 'minimal'])

      expect(mockWizard.runWizard).toHaveBeenCalledWith({
        interactive: true,
        useDefaults: false,
        preset: 'minimal',
      })

      expect(mockWizard.saveConfig).toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📦 Based on preset: minimal'),
      )
      expect(mockRl.question).toHaveBeenCalled()
    })

    it('should save to custom path', async () => {
      mockWizard.saveConfig.mockResolvedValue('/custom/config.yaml')

      await handleWizardCommand(['--save', '/custom/config.yaml'])

      expect(mockWizard.saveConfig).toHaveBeenCalledWith(expect.any(Object), '/custom/config.yaml')

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Configuration saved to: /custom/config.yaml'),
      )
      expect(mockRl.question).toHaveBeenCalled()
    })

    it('should handle wizard errors', async () => {
      mockWizard.runWizard.mockRejectedValue(new Error('Wizard failed'))

      await expect(handleWizardCommand([])).rejects.toThrow('Process exited with code 1')
    })
  })

  describe('recommendation mode', () => {
    it('should show recommendations when --recommend is provided', async () => {
      // Simulate user responses for recommendation questions
      const responses = ['2', '2', '1'] // intermediate, balanced, personal
      let responseIndex = 0

      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      await handleWizardCommand(['--recommend'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🎯 Let me help you find the right configuration preset!'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('What is your experience level'),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✨ Based on your preferences'),
      )

      expect(mockWizard.getRecommendedPresets).toHaveBeenCalledWith({
        experience: 'intermediate',
        workflow: 'balanced',
        environment: 'personal',
      })

      // Should display recommended presets
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Minimal'))
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Cautious'))
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Use: coda wizard --preset'),
      )

      expect(mockRl.close).toHaveBeenCalled()
    })

    it('should handle beginner preferences', async () => {
      const responses = ['1', '1', '1'] // beginner, careful, personal
      let responseIndex = 0

      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      mockWizard.getRecommendedPresets.mockReturnValue(['cautious'])

      await handleWizardCommand(['--recommend'])

      expect(mockWizard.getRecommendedPresets).toHaveBeenCalledWith({
        experience: 'beginner',
        workflow: 'careful',
        environment: 'personal',
      })
    })

    it('should handle expert preferences', async () => {
      const responses = ['3', '3', '3'] // expert, fast, ci
      let responseIndex = 0

      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      mockWizard.getRecommendedPresets.mockReturnValue(['productive', 'ci-friendly'])

      await handleWizardCommand(['--recommend'])

      expect(mockWizard.getRecommendedPresets).toHaveBeenCalledWith({
        experience: 'expert',
        workflow: 'fast',
        environment: 'ci',
      })
    })

    it('should show tip about browsing all presets', async () => {
      const responses = ['2', '2', '2']
      let responseIndex = 0

      mockRl.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[responseIndex++])
      })

      await handleWizardCommand(['--recommend'])

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('💡 Tip: You can also browse all presets with: coda preset list'),
      )
    })
  })

  describe('starting AI session', () => {
    it('should ask to start AI session after interactive wizard', async () => {
      mockWizard.runWizard.mockResolvedValue({ provider: 'claude-code', yolo: true })
      mockWizard.saveConfig.mockResolvedValue('/test/config.yaml')

      // Mock readline to respond 'n' to not start session
      mockRl.question.mockImplementation((question: string, callback: Function) => {
        if (question.includes('start an AI session')) {
          callback('n')
        }
      })

      await handleWizardCommand([])

      expect(mockRl.question).toHaveBeenCalledWith(
        expect.stringContaining('Would you like to start an AI session now?'),
        expect.any(Function),
      )
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('You can now use Coda'))
    })

    it('should not ask to start session when using --defaults', async () => {
      mockWizard.runWizard.mockResolvedValue({ provider: 'claude-code' })
      mockWizard.saveConfig.mockResolvedValue('/test/config.yaml')

      await handleWizardCommand(['--defaults'])

      expect(mockRl.question).not.toHaveBeenCalled()
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('You can now use Coda'))
    })
  })
})
