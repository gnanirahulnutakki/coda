import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawn } from 'child_process'
import { AiderAdapter } from '../../src/providers/aider-adapter.js'
import * as aiProviders from '../../src/config/ai-providers.js'

vi.mock('child_process')
vi.mock('../../src/config/ai-providers.js')

describe('AiderAdapter', () => {
  let mockProcess: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock process object
    mockProcess = {
      on: vi.fn(),
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      stdin: {
        write: vi.fn(),
      },
    }

    vi.mocked(spawn).mockReturnValue(mockProcess as any)
    vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/aider')
  })

  describe('constructor', () => {
    it('should initialize with aider command', () => {
      const adapter = new AiderAdapter()
      expect(aiProviders.getProviderCommand).toHaveBeenCalledWith('aider')
    })

    it('should throw error if aider not found', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue(null)

      expect(() => new AiderAdapter()).toThrow(
        'Aider not found. Install with: pip install aider-install',
      )
    })
  })

  describe('start', () => {
    it('should start aider with default options', async () => {
      const adapter = new AiderAdapter()
      const process = await adapter.start()

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        [],
        expect.objectContaining({
          stdio: 'inherit',
          shell: true,
        }),
      )
      expect(process).toBe(mockProcess)
    })

    it('should start aider with model option', async () => {
      const adapter = new AiderAdapter()
      await adapter.start({ model: 'gpt-4' })

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        ['--model', 'gpt-4'],
        expect.any(Object),
      )
    })

    it('should start aider with multiple options', async () => {
      const adapter = new AiderAdapter()
      await adapter.start({
        model: 'claude-3-sonnet',
        noAutoCommits: true,
        yesAlways: true,
        voice: true,
        files: ['src/app.ts', 'src/utils.ts'],
        message: 'Fix the bug in authentication',
      })

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        [
          '--model',
          'claude-3-sonnet',
          '--no-auto-commits',
          '--yes-always',
          '--voice',
          'src/app.ts',
          'src/utils.ts',
          '--message',
          'Fix the bug in authentication',
        ],
        expect.any(Object),
      )
    })

    it('should use custom cwd and env', async () => {
      const adapter = new AiderAdapter()
      await adapter.start({
        cwd: '/custom/path',
        env: { OPENAI_API_KEY: 'test-key' },
      })

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        [],
        expect.objectContaining({
          cwd: '/custom/path',
          env: expect.objectContaining({
            OPENAI_API_KEY: 'test-key',
          }),
        }),
      )
    })

    it('should handle process errors', async () => {
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const adapter = new AiderAdapter()
      await adapter.start()

      // Simulate error event
      const errorHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'error')?.[1]
      const testError = new Error('Process failed')
      errorHandler(testError)

      expect(mockConsoleError).toHaveBeenCalledWith('Aider process error:', testError)
      mockConsoleError.mockRestore()
    })

    it('should handle process exit', async () => {
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
      const adapter = new AiderAdapter()
      await adapter.start()

      // Simulate exit event
      const exitHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'exit')?.[1]
      exitHandler(1, 'SIGTERM')

      expect(mockConsoleLog).toHaveBeenCalledWith('Aider exited with code 1 (signal: SIGTERM)')
      mockConsoleLog.mockRestore()
    })
  })

  describe('sendMessage', () => {
    it('should send message and return output', async () => {
      const adapter = new AiderAdapter()

      // Setup stdout mock
      mockProcess.stdout.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from('Response from Aider'))
        }
      })

      // Setup close mock
      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'close') {
          setTimeout(() => handler(0), 10)
        }
      })

      const result = await adapter.sendMessage('Fix the login bug')

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        ['--message', 'Fix the login bug', '--no-pretty'],
        expect.any(Object),
      )
      expect(result).toBe('Response from Aider')
    })

    it('should handle sendMessage with options', async () => {
      const adapter = new AiderAdapter()

      mockProcess.stdout.on.mockImplementation((event, handler) => {
        if (event === 'data') handler(Buffer.from('OK'))
      })
      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'close') handler(0)
      })

      await adapter.sendMessage('Refactor this code', {
        model: 'gpt-4',
        files: ['main.py'],
        yesAlways: true,
        noAutoCommits: true,
      })

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        [
          '--message',
          'Refactor this code',
          '--no-pretty',
          '--model',
          'gpt-4',
          'main.py',
          '--yes-always',
          '--no-auto-commits',
        ],
        expect.any(Object),
      )
    })

    it('should handle sendMessage errors', async () => {
      const adapter = new AiderAdapter()

      mockProcess.stderr.on.mockImplementation((event, handler) => {
        if (event === 'data') handler(Buffer.from('Error occurred'))
      })
      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'close') handler(1)
      })

      await expect(adapter.sendMessage('Bad request')).rejects.toThrow(
        'Aider failed with code 1: Error occurred',
      )
    })
  })

  describe('static methods', () => {
    it('isAvailable should return true when aider is found', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/aider')
      expect(AiderAdapter.isAvailable()).toBe(true)
    })

    it('isAvailable should return false when aider is not found', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue(null)
      expect(AiderAdapter.isAvailable()).toBe(false)
    })

    it('applyCodeConfig should map Coda config to Aider options', () => {
      const codaConfig = {
        yolo: true,
        quiet: false,
        dangerously_allow_without_version_control: true,
      }

      const aiderOptions = AiderAdapter.applyCodeConfig(codaConfig)

      expect(aiderOptions).toEqual({
        yesAlways: true,
        noAutoCommits: true,
      })
    })

    it('applyCodeConfig should handle minimal config', () => {
      const codaConfig = {}
      const aiderOptions = AiderAdapter.applyCodeConfig(codaConfig)

      expect(aiderOptions).toEqual({})
    })
  })

  describe('getVersion', () => {
    it('should return aider version', async () => {
      const adapter = new AiderAdapter()

      mockProcess.stdout.on.mockImplementation((event, handler) => {
        if (event === 'data') handler(Buffer.from('aider 0.21.0\n'))
      })
      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'close') handler(0)
      })

      const version = await adapter.getVersion()

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/aider',
        ['--version'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      )
      expect(version).toBe('aider 0.21.0')
    })

    it('should handle version check failure', async () => {
      const adapter = new AiderAdapter()

      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'close') handler(1)
      })

      await expect(adapter.getVersion()).rejects.toThrow('Failed to get Aider version')
    })
  })
})
