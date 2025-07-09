import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import { execSync } from 'child_process'
import {
  AI_PROVIDERS,
  detectAvailableProviders,
  getProvider,
  isProviderAvailable,
  getProviderCommand
} from '../../src/config/ai-providers.js'

vi.mock('fs')
vi.mock('child_process')

describe('AI Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  describe('AI_PROVIDERS configuration', () => {
    it('should have all expected providers', () => {
      const expectedProviders = [
        'claude-code',
        'gemini',
        'aider',
        'cline',
        'github-copilot',
        'cody',
        'amazon-q',
        'continue'
      ]
      
      for (const id of expectedProviders) {
        expect(AI_PROVIDERS[id]).toBeDefined()
        expect(AI_PROVIDERS[id].id).toBe(id)
      }
    })
    
    it('should have proper provider metadata', () => {
      const aider = AI_PROVIDERS['aider']
      expect(aider.name).toBe('Aider')
      expect(aider.category).toBe('native-cli')
      expect(aider.priority).toBe('high')
      expect(aider.features).toContain('git-aware')
      expect(aider.features).toContain('multi-file-editing')
    })
  })
  
  describe('Provider detection', () => {
    it('should detect aider when available', () => {
      vi.mocked(execSync).mockReturnValue('/usr/local/bin/aider\n')
      
      const command = AI_PROVIDERS['aider'].detectCommand()
      expect(command).toBe('/usr/local/bin/aider')
      expect(execSync).toHaveBeenCalledWith('which aider', { encoding: 'utf8' })
    })
    
    it('should return null for aider when not available', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found')
      })
      
      const command = AI_PROVIDERS['aider'].detectCommand()
      expect(command).toBeNull()
    })
    
    it('should detect GitHub Copilot when gh and extension are installed', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') return '/usr/local/bin/gh\n'
        if (cmd === 'gh extension list') return 'copilot\nother-extension\n'
        throw new Error('Unknown command')
      })
      
      const command = AI_PROVIDERS['github-copilot'].detectCommand()
      expect(command).toBe('gh copilot')
    })
    
    it('should not detect GitHub Copilot when extension is missing', () => {
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which gh') return '/usr/local/bin/gh\n'
        if (cmd === 'gh extension list') return 'other-extension\n'
        throw new Error('Unknown command')
      })
      
      const command = AI_PROVIDERS['github-copilot'].detectCommand()
      expect(command).toBeNull()
    })
    
    it('should detect claude-code in custom paths', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found')
      })
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.includes('.claude/local')
      })
      vi.mocked(fs.accessSync).mockImplementation(() => {})
      
      const command = AI_PROVIDERS['claude-code'].detectCommand()
      expect(command).toContain('.claude/local')
    })
  })
  
  describe('detectAvailableProviders', () => {
    it('should return available providers sorted by priority', () => {
      // Mock different providers as available
      vi.mocked(execSync).mockImplementation((cmd) => {
        if (cmd === 'which aider') return '/usr/local/bin/aider\n'
        if (cmd === 'which cody') return '/usr/local/bin/cody\n'
        if (cmd === 'which aws-q') return '/usr/local/bin/aws-q\n'
        throw new Error('Command not found')
      })
      
      const available = detectAvailableProviders()
      
      expect(available).toHaveLength(3)
      expect(available[0].provider.id).toBe('aider') // high priority
      expect(available[1].provider.id).toBe('cody') // medium priority
      expect(available[2].provider.id).toBe('amazon-q') // low priority
    })
    
    it('should return empty array when no providers available', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found')
      })
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const available = detectAvailableProviders()
      expect(available).toHaveLength(0)
    })
  })
  
  describe('Helper functions', () => {
    it('getProvider should return provider by ID', () => {
      const provider = getProvider('aider')
      expect(provider).toBeDefined()
      expect(provider?.name).toBe('Aider')
    })
    
    it('getProvider should return undefined for invalid ID', () => {
      const provider = getProvider('invalid-provider')
      expect(provider).toBeUndefined()
    })
    
    it('isProviderAvailable should check if provider is installed', () => {
      vi.mocked(execSync).mockReturnValue('/usr/local/bin/aider\n')
      
      expect(isProviderAvailable('aider')).toBe(true)
      
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found')
      })
      
      expect(isProviderAvailable('aider')).toBe(false)
      expect(isProviderAvailable('invalid')).toBe(false)
    })
    
    it('getProviderCommand should return command path', () => {
      vi.mocked(execSync).mockReturnValue('/usr/local/bin/aider\n')
      
      expect(getProviderCommand('aider')).toBe('/usr/local/bin/aider')
      expect(getProviderCommand('invalid')).toBeNull()
    })
  })
  
  describe('Provider-specific tests', () => {
    describe('Aider', () => {
      it('should have correct configuration', () => {
        const aider = AI_PROVIDERS['aider']
        expect(aider.installInstructions).toContain('pip install')
        expect(aider.features).toContain('git-aware')
        expect(aider.features).toContain('voice-input')
        expect(aider.configKeys).toContain('openai_api_key')
        expect(aider.configKeys).toContain('anthropic_api_key')
      })
    })
    
    describe('Cline', () => {
      it('should have correct configuration', () => {
        const cline = AI_PROVIDERS['cline']
        expect(cline.category).toBe('ide-extension')
        expect(cline.features).toContain('autonomous')
        expect(cline.installInstructions).toContain('VS Code')
      })
    })
    
    describe('GitHub Copilot', () => {
      it('should have correct configuration', () => {
        const copilot = AI_PROVIDERS['github-copilot']
        expect(copilot.category).toBe('native-cli')
        expect(copilot.features).toContain('terminal-commands')
        expect(copilot.installInstructions).toContain('gh extension')
      })
    })
  })
})