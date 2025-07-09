import { describe, it, expect, beforeEach, vi } from 'vitest'
import { spawn } from 'child_process'
import { ProviderFactory } from '../../src/providers/provider-factory.js'
import { AiderAdapter } from '../../src/providers/aider-adapter.js'
import * as aiProviders from '../../src/config/ai-providers.js'

vi.mock('child_process')
vi.mock('../../src/providers/aider-adapter.js')
vi.mock('../../src/config/ai-providers.js')

describe('ProviderFactory', () => {
  let mockProcess: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    mockProcess = {
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() }
    }
    
    vi.mocked(spawn).mockReturnValue(mockProcess as any)
  })
  
  describe('createAdapter', () => {
    it('should create DefaultProviderAdapter for claude-code', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/claude')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'claude-code',
        name: 'Claude Code',
        description: 'Test',
        category: 'native-cli',
        priority: 'high',
        detectCommand: vi.fn(),
        installInstructions: 'Test',
        features: ['chat', 'code-generation']
      })
      
      const adapter = ProviderFactory.createAdapter('claude-code')
      expect(adapter).toBeDefined()
      expect(adapter.getName()).toBe('Claude Code')
    })
    
    it('should create AiderProviderAdapter for aider', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/aider')
      const mockAiderAdapter = {
        start: vi.fn().mockResolvedValue(mockProcess)
      }
      vi.mocked(AiderAdapter).mockImplementation(() => mockAiderAdapter as any)
      
      const adapter = ProviderFactory.createAdapter('aider')
      expect(adapter).toBeDefined()
      expect(adapter.getName()).toBe('Aider')
    })
    
    it('should create GitHubCopilotAdapter for github-copilot', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('gh copilot')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'github-copilot',
        name: 'GitHub Copilot CLI',
        description: 'Test',
        category: 'native-cli',
        priority: 'medium',
        detectCommand: vi.fn(),
        installInstructions: 'Test',
        features: ['explain', 'suggest']
      })
      
      const adapter = ProviderFactory.createAdapter('github-copilot')
      expect(adapter).toBeDefined()
      expect(adapter.getName()).toBe('GitHub Copilot CLI')
    })
    
    it('should throw error if provider not found', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue(null)
      
      expect(() => ProviderFactory.createAdapter('unknown')).toThrow(
        "Provider 'unknown' not found or not installed"
      )
    })
    
    it('should use custom path if provided', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue(null)
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'custom',
        name: 'Custom Provider',
        description: 'Test',
        category: 'native-cli',
        priority: 'low',
        detectCommand: vi.fn(),
        installInstructions: 'Test'
      })
      
      const adapter = ProviderFactory.createAdapter('custom', '/custom/path/provider')
      expect(adapter).toBeDefined()
    })
  })
  
  describe('DefaultProviderAdapter', () => {
    it('should start provider with spawn', async () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/claude')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'claude-code',
        name: 'Claude Code',
        description: 'Test',
        category: 'native-cli',
        priority: 'high',
        detectCommand: vi.fn(),
        installInstructions: 'Test'
      })
      
      const adapter = ProviderFactory.createAdapter('claude-code')
      const config = { provider: 'claude-code' }
      const process = await adapter.start(['--help'], config)
      
      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        ['--help'],
        expect.objectContaining({
          stdio: 'inherit',
          shell: true
        })
      )
      expect(process).toBe(mockProcess)
    })
    
    it('should check feature support', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/gemini')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'gemini',
        name: 'Gemini',
        description: 'Test',
        category: 'native-cli',
        priority: 'high',
        detectCommand: vi.fn(),
        installInstructions: 'Test',
        features: ['chat', 'code-generation', 'multi-modal']
      })
      
      const adapter = ProviderFactory.createAdapter('gemini')
      expect(adapter.supportsFeature('chat')).toBe(true)
      expect(adapter.supportsFeature('multi-modal')).toBe(true)
      expect(adapter.supportsFeature('voice-input')).toBe(false)
    })
  })
  
  describe('AiderProviderAdapter', () => {
    beforeEach(() => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/aider')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'aider',
        name: 'Aider',
        description: 'Test',
        category: 'native-cli',
        priority: 'high',
        detectCommand: vi.fn(),
        installInstructions: 'Test',
        features: ['git-aware', 'multi-file-editing']
      })
    })
    
    it('should convert config and start aider', async () => {
      const mockAiderAdapter = {
        start: vi.fn().mockResolvedValue(mockProcess)
      }
      vi.mocked(AiderAdapter).mockImplementation(() => mockAiderAdapter as any)
      vi.mocked(AiderAdapter.applyCodeConfig).mockReturnValue({ yesAlways: true })
      
      const adapter = ProviderFactory.createAdapter('aider')
      const config = { yolo: true, provider: 'aider' }
      await adapter.start(['Fix the bug'], config)
      
      expect(AiderAdapter.applyCodeConfig).toHaveBeenCalledWith(config)
      expect(mockAiderAdapter.start).toHaveBeenCalledWith({
        yesAlways: true,
        message: 'Fix the bug'
      })
    })
    
    it('should parse aider-specific flags', async () => {
      const mockAiderAdapter = {
        start: vi.fn().mockResolvedValue(mockProcess)
      }
      vi.mocked(AiderAdapter).mockImplementation(() => mockAiderAdapter as any)
      vi.mocked(AiderAdapter.applyCodeConfig).mockReturnValue({})
      
      const adapter = ProviderFactory.createAdapter('aider')
      await adapter.start(['--model', 'gpt-4', '--voice', 'Update tests'], {})
      
      expect(mockAiderAdapter.start).toHaveBeenCalledWith({
        model: 'gpt-4',
        voice: true,
        message: 'Update tests'
      })
    })
  })
  
  describe('GitHubCopilotAdapter', () => {
    beforeEach(() => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('gh copilot')
    })
    
    it('should start github copilot with suggest default', async () => {
      const adapter = ProviderFactory.createAdapter('github-copilot')
      await adapter.start(['write a function'], {})
      
      expect(spawn).toHaveBeenCalledWith(
        'gh',
        ['copilot', 'suggest', 'write a function'],
        expect.objectContaining({
          stdio: 'inherit'
        })
      )
    })
    
    it('should preserve explicit commands', async () => {
      const adapter = ProviderFactory.createAdapter('github-copilot')
      await adapter.start(['explain', 'this code'], {})
      
      expect(spawn).toHaveBeenCalledWith(
        'gh',
        ['copilot', 'explain', 'this code'],
        expect.any(Object)
      )
    })
  })
  
  describe('supportsFeature static method', () => {
    it('should check feature support for valid provider', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue('/usr/local/bin/aider')
      vi.mocked(aiProviders.getProvider).mockReturnValue({
        id: 'aider',
        name: 'Aider',
        description: 'Test',
        category: 'native-cli',
        priority: 'high',
        detectCommand: vi.fn(),
        installInstructions: 'Test',
        features: ['git-aware', 'voice-input']
      })
      
      expect(ProviderFactory.supportsFeature('aider', 'git-aware')).toBe(true)
      expect(ProviderFactory.supportsFeature('aider', 'unknown-feature')).toBe(false)
    })
    
    it('should return false for invalid provider', () => {
      vi.mocked(aiProviders.getProviderCommand).mockReturnValue(null)
      
      expect(ProviderFactory.supportsFeature('invalid', 'any-feature')).toBe(false)
    })
  })
})