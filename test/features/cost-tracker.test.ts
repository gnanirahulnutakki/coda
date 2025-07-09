import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { CostTracker, PROVIDER_PRICING } from '../../src/features/cost-tracker.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')

describe('CostTracker', () => {
  let costTracker: CostTracker
  const mockConfigDir = '/test/.coda'
  const mockDataDir = '/test/.coda/cost-tracking'
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)
    
    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('[]')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
    
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project')
    
    costTracker = new CostTracker()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create data directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDataDir, { recursive: true })
    })

    it('should not create directory if it already exists', () => {
      vi.clearAllMocks()
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      new CostTracker()
      
      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })

    it('should load existing limits', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'limits.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        daily: 10.00,
        weekly: 50.00,
        currency: 'USD'
      }))
      
      const tracker = new CostTracker()
      const limits = tracker.getLimits()
      
      expect(limits).toEqual({
        daily: 10.00,
        weekly: 50.00,
        currency: 'USD'
      })
    })

    it('should handle corrupted limits file', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'limits.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')
      
      const tracker = new CostTracker()
      const limits = tracker.getLimits()
      
      expect(limits).toBeNull()
    })
  })

  describe('recordUsage', () => {
    it('should record usage session with cost calculation', () => {
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1
      }
      
      const sessionId = costTracker.recordUsage('claude-code', usage, {}, 'claude-3-5-sonnet-20241022', 'test command')
      
      expect(sessionId).toBeDefined()
      expect(fs.appendFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'sessions.jsonl'),
        expect.stringContaining('"provider":"claude-code"')
      )
    })

    it('should calculate correct costs for claude-code provider', () => {
      const usage = {
        inputTokens: 1_000_000, // 1M tokens
        outputTokens: 500_000,  // 0.5M tokens
        totalTokens: 1_500_000,
        requestCount: 1
      }
      
      // Mock the file write to capture the session data
      let capturedSession: any
      vi.mocked(fs.appendFileSync).mockImplementation((file, data) => {
        capturedSession = JSON.parse(data as string)
      })
      
      costTracker.recordUsage('claude-code', usage, {}, 'claude-3-5-sonnet-20241022')
      
      expect(capturedSession.cost).toEqual({
        inputCost: 3.00,   // 1M * $3
        outputCost: 7.50,  // 0.5M * $15
        totalCost: 10.50,
        currency: 'USD'
      })
    })

    it('should calculate correct costs for gemini provider', () => {
      const usage = {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        requestCount: 1
      }
      
      let capturedSession: any
      vi.mocked(fs.appendFileSync).mockImplementation((file, data) => {
        capturedSession = JSON.parse(data as string)
      })
      
      costTracker.recordUsage('gemini', usage, {}, 'gemini-1.5-flash')
      
      expect(capturedSession.cost).toEqual({
        inputCost: 0.075,  // 1M * $0.075
        outputCost: 0.30,  // 1M * $0.30
        totalCost: 0.375,
        currency: 'USD'
      })
    })

    it('should handle unknown provider gracefully', () => {
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1
      }
      
      let capturedSession: any
      vi.mocked(fs.appendFileSync).mockImplementation((file, data) => {
        capturedSession = JSON.parse(data as string)
      })
      
      costTracker.recordUsage('unknown-provider', usage)
      
      expect(capturedSession.cost).toEqual({
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD'
      })
    })

    it('should include metadata in session', () => {
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1
      }
      
      const metadata = {
        duration: 5000,
        success: false,
        errorType: 'timeout'
      }
      
      let capturedSession: any
      vi.mocked(fs.appendFileSync).mockImplementation((file, data) => {
        capturedSession = JSON.parse(data as string)
      })
      
      costTracker.recordUsage('claude-code', usage, metadata, 'claude-3-haiku-20240307', 'test command')
      
      expect(capturedSession.metadata).toMatchObject({
        project: 'project',
        cwd: '/test/project',
        duration: 5000,
        success: false,
        errorType: 'timeout'
      })
      expect(capturedSession.command).toBe('test command')
      expect(capturedSession.model).toBe('claude-3-haiku-20240307')
    })

    it('should update daily summary when recording usage', () => {
      // Mock existing summaries
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'daily-summaries.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([]))
      
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1
      }
      
      costTracker.recordUsage('claude-code', usage)
      
      // Should write updated summaries
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'daily-summaries.json'),
        expect.stringContaining('totalCost')
      )
    })
  })

  describe('loadRecentSessions', () => {
    it('should return empty array when no sessions file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const sessions = costTracker.loadRecentSessions()
      
      expect(sessions).toEqual([])
    })

    it('should load and parse JSONL sessions file', () => {
      const mockSessions = [
        { id: '1', provider: 'claude-code', usage: { totalTokens: 1000 } },
        { id: '2', provider: 'gemini', usage: { totalTokens: 2000 } }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        mockSessions.map(s => JSON.stringify(s)).join('\n')
      )
      
      const sessions = costTracker.loadRecentSessions()
      
      expect(sessions).toEqual(mockSessions)
    })

    it('should limit number of sessions returned', () => {
      const mockSessions = Array.from({ length: 150 }, (_, i) => ({
        id: i.toString(),
        provider: 'claude-code'
      }))
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        mockSessions.map(s => JSON.stringify(s)).join('\n')
      )
      
      const sessions = costTracker.loadRecentSessions(100)
      
      expect(sessions).toHaveLength(100)
      expect(sessions[0].id).toBe('50') // Should get the last 100
    })

    it('should handle corrupted sessions file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json\n{broken')
      
      const sessions = costTracker.loadRecentSessions()
      
      expect(sessions).toEqual([])
    })
  })

  describe('cost limits', () => {
    it('should set and get limits', () => {
      const limits = {
        daily: 10.00,
        weekly: 50.00,
        monthly: 200.00,
        currency: 'USD'
      }
      
      costTracker.setLimits(limits)
      
      expect(costTracker.getLimits()).toEqual(limits)
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'limits.json'),
        JSON.stringify(limits, null, 2)
      )
    })

    it('should merge partial limits with existing ones', () => {
      costTracker.setLimits({ daily: 10.00, currency: 'USD' })
      costTracker.setLimits({ weekly: 50.00 })
      
      expect(costTracker.getLimits()).toEqual({
        daily: 10.00,
        weekly: 50.00,
        currency: 'USD'
      })
    })

    it('should check limit status correctly', () => {
      // Set limits
      costTracker.setLimits({
        daily: 10.00,
        weekly: 50.00,
        monthly: 200.00,
        currency: 'USD'
      })
      
      // Mock cost calculation methods
      vi.spyOn(costTracker, 'getDailyCost').mockReturnValue(8.50)
      vi.spyOn(costTracker, 'getCostSince').mockReturnValueOnce(45.00).mockReturnValueOnce(180.00)
      
      const status = costTracker.getLimitStatus()
      
      expect(status).toEqual({
        daily: {
          used: 8.50,
          limit: 10.00,
          percentage: 85,
          exceeded: false
        },
        weekly: {
          used: 45.00,
          limit: 50.00,
          percentage: 90,
          exceeded: false
        },
        monthly: {
          used: 180.00,
          limit: 200.00,
          percentage: 90,
          exceeded: false
        }
      })
    })

    it('should warn when limits are exceeded', () => {
      // Mock console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      costTracker.setLimits({ daily: 5.00, currency: 'USD' })
      
      // Mock getDailyCost to return a value exceeding the limit
      vi.spyOn(costTracker, 'getDailyCost').mockReturnValue(6.00)
      
      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        requestCount: 1
      }
      
      costTracker.recordUsage('claude-code', usage)
      
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Daily cost limit exceeded')
      )
      
      warnSpy.mockRestore()
    })
  })

  describe('getUsageStats', () => {
    beforeEach(() => {
      // Mock daily summaries
      const mockSummaries = [
        {
          date: '2024-01-01',
          totalCost: 15.50,
          totalTokens: 10000,
          totalRequests: 5,
          providers: {
            'claude-code': {
              inputTokens: 8000, outputTokens: 2000, totalTokens: 10000,
              requestCount: 5, inputCost: 5.50, outputCost: 10.00, totalCost: 15.50,
              currency: 'USD'
            }
          },
          projects: {
            'project-a': {
              inputTokens: 5000, outputTokens: 1000, totalTokens: 6000,
              requestCount: 3, inputCost: 3.00, outputCost: 5.00, totalCost: 8.00,
              currency: 'USD'
            },
            'project-b': {
              inputTokens: 3000, outputTokens: 1000, totalTokens: 4000,
              requestCount: 2, inputCost: 2.50, outputCost: 5.00, totalCost: 7.50,
              currency: 'USD'
            }
          }
        },
        {
          date: '2024-01-02',
          totalCost: 8.25,
          totalTokens: 5000,
          totalRequests: 2,
          providers: {
            'gemini': {
              inputTokens: 3000, outputTokens: 2000, totalTokens: 5000,
              requestCount: 2, inputCost: 2.25, outputCost: 6.00, totalCost: 8.25,
              currency: 'USD'
            }
          },
          projects: {
            'project-a': {
              inputTokens: 3000, outputTokens: 2000, totalTokens: 5000,
              requestCount: 2, inputCost: 2.25, outputCost: 6.00, totalCost: 8.25,
              currency: 'USD'
            }
          }
        }
      ]
      
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'daily-summaries.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSummaries))
    })

    it('should return comprehensive usage statistics', () => {
      const stats = costTracker.getUsageStats()
      
      expect(stats).toMatchObject({
        totalCost: 23.75,
        totalTokens: 15000,
        totalRequests: 7,
        averageCostPerRequest: 23.75 / 7,
        averageTokensPerRequest: 15000 / 7
      })
      
      expect(stats.breakdown.byProvider).toHaveProperty('claude-code')
      expect(stats.breakdown.byProvider).toHaveProperty('gemini')
      expect(stats.breakdown.byProject).toHaveProperty('project-a')
      expect(stats.breakdown.byProject).toHaveProperty('project-b')
    })

    it('should filter by date range', () => {
      const stats = costTracker.getUsageStats({
        startDate: '2024-01-02',
        endDate: '2024-01-02'
      })
      
      expect(stats.totalCost).toBe(8.25)
      expect(stats.totalTokens).toBe(5000)
      expect(stats.totalRequests).toBe(2)
      expect(stats.breakdown.byProvider).toHaveProperty('gemini')
      expect(stats.breakdown.byProvider).not.toHaveProperty('claude-code')
    })

    it('should filter by provider', () => {
      const stats = costTracker.getUsageStats({
        provider: 'claude-code'
      })
      
      expect(stats.breakdown.byProvider).toHaveProperty('claude-code')
      expect(stats.breakdown.byProvider).not.toHaveProperty('gemini')
    })

    it('should filter by project', () => {
      const stats = costTracker.getUsageStats({
        project: 'project-a'
      })
      
      expect(stats.breakdown.byProject).toHaveProperty('project-a')
      expect(stats.breakdown.byProject).not.toHaveProperty('project-b')
    })
  })

  describe('estimateCost', () => {
    it('should estimate cost for claude-code provider', () => {
      const cost = costTracker.estimateCost('claude-code', 1_000_000, 500_000, 'claude-3-5-sonnet-20241022')
      
      expect(cost).toEqual({
        inputCost: 3.00,
        outputCost: 7.50,
        totalCost: 10.50,
        currency: 'USD'
      })
    })

    it('should estimate cost for gemini provider', () => {
      const cost = costTracker.estimateCost('gemini', 2_000_000, 1_000_000, 'gemini-1.5-flash')
      
      expect(cost).toEqual({
        inputCost: 0.15,  // 2M * $0.075
        outputCost: 0.30, // 1M * $0.30
        totalCost: 0.45,
        currency: 'USD'
      })
    })

    it('should return zero cost for unknown provider', () => {
      const cost = costTracker.estimateCost('unknown', 1000, 500)
      
      expect(cost).toEqual({
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD'
      })
    })

    it('should use default model when none specified', () => {
      const cost = costTracker.estimateCost('claude-code', 1_000_000, 0)
      
      // Should use first available model (claude-3-5-sonnet-20241022)
      expect(cost.inputCost).toBe(3.00)
      expect(cost.totalCost).toBe(3.00)
    })
  })

  describe('exportData', () => {
    it('should export usage data to file', () => {
      // Mock sessions and summaries
      const mockSessions = [
        { id: '1', timestamp: '2024-01-01T10:00:00Z', provider: 'claude-code' }
      ]
      const mockSummaries = [
        { date: '2024-01-01', totalCost: 10.50 }
      ]
      
      vi.spyOn(costTracker, 'loadRecentSessions').mockReturnValue(mockSessions as any)
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === path.join(mockDataDir, 'daily-summaries.json')
      })
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSummaries))
      
      costTracker.exportData('/test/export.json')
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        call => call[0] === '/test/export.json'
      )
      
      expect(writeCall).toBeDefined()
      const exportedData = JSON.parse(writeCall![1] as string)
      expect(exportedData).toHaveProperty('exportDate')
      expect(exportedData).toHaveProperty('sessions')
      expect(exportedData).toHaveProperty('summaries')
    })

    it('should filter exported data by date range', () => {
      const mockSessions = [
        { id: '1', timestamp: '2024-01-01T10:00:00Z', provider: 'claude-code' },
        { id: '2', timestamp: '2024-01-02T10:00:00Z', provider: 'gemini' },
        { id: '3', timestamp: '2024-01-03T10:00:00Z', provider: 'claude-code' }
      ]
      
      vi.spyOn(costTracker, 'loadRecentSessions').mockReturnValue(mockSessions as any)
      vi.mocked(fs.readFileSync).mockReturnValue('[]')
      
      costTracker.exportData('/test/export.json', {
        startDate: '2024-01-02',
        endDate: '2024-01-02'
      })
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls.find(
        call => call[0] === '/test/export.json'
      )
      
      const exportedData = JSON.parse(writeCall![1] as string)
      expect(exportedData.sessions).toHaveLength(1)
      expect(exportedData.sessions[0].id).toBe('2')
    })
  })

  describe('getTopExpensiveCommands', () => {
    it('should return top expensive commands', () => {
      const mockSessions = [
        {
          command: 'code-review',
          provider: 'claude-code',
          cost: { totalCost: 10.00 }
        },
        {
          command: 'code-review',
          provider: 'claude-code',
          cost: { totalCost: 8.00 }
        },
        {
          command: 'documentation',
          provider: 'gemini',
          cost: { totalCost: 5.00 }
        },
        {
          command: 'translation',
          provider: 'claude-code',
          cost: { totalCost: 3.00 }
        }
      ]
      
      vi.spyOn(costTracker, 'loadRecentSessions').mockReturnValue(mockSessions as any)
      
      const topCommands = costTracker.getTopExpensiveCommands(3)
      
      expect(topCommands).toHaveLength(3)
      expect(topCommands[0]).toMatchObject({
        command: 'code-review',
        provider: 'claude-code',
        totalCost: 18.00,
        totalRequests: 2,
        averageCost: 9.00
      })
      expect(topCommands[1]).toMatchObject({
        command: 'documentation',
        provider: 'gemini',
        totalCost: 5.00
      })
    })

    it('should handle sessions without commands', () => {
      const mockSessions = [
        { command: 'test', provider: 'claude-code', cost: { totalCost: 5.00 } },
        { provider: 'claude-code', cost: { totalCost: 10.00 } } // No command
      ]
      
      vi.spyOn(costTracker, 'loadRecentSessions').mockReturnValue(mockSessions as any)
      
      const topCommands = costTracker.getTopExpensiveCommands()
      
      expect(topCommands).toHaveLength(1)
      expect(topCommands[0].command).toBe('test')
    })
  })

  describe('provider pricing', () => {
    it('should have correct pricing structure', () => {
      expect(PROVIDER_PRICING).toHaveProperty('claude-code')
      expect(PROVIDER_PRICING).toHaveProperty('gemini')
      
      expect(PROVIDER_PRICING['claude-code']).toHaveProperty('claude-3-5-sonnet-20241022')
      expect(PROVIDER_PRICING['claude-code']['claude-3-5-sonnet-20241022']).toMatchObject({
        input: expect.any(Number),
        output: expect.any(Number),
        currency: 'USD'
      })
    })
  })
})