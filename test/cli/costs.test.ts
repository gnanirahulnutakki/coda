import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleCostsCommand } from '../../src/cli/costs.js'
import { CostTracker } from '../../src/features/cost-tracker.js'

vi.mock('../../src/features/cost-tracker.js')
vi.mock('../../src/utils/logging.js')

describe('handleCostsCommand', () => {
  let mockCostTracker: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    mockCostTracker = {
      getUsageStats: vi.fn().mockReturnValue({
        totalCost: 25.50,
        totalTokens: 100000,
        totalRequests: 10,
        averageCostPerRequest: 2.55,
        averageTokensPerRequest: 10000,
        breakdown: {
          byProvider: {
            'claude-code': {
              totalCost: 20.00,
              totalTokens: 80000,
              requestCount: 8
            },
            'gemini': {
              totalCost: 5.50,
              totalTokens: 20000,
              requestCount: 2
            }
          },
          byProject: {
            'project-a': {
              totalCost: 15.00,
              totalTokens: 60000,
              requestCount: 6
            },
            'project-b': {
              totalCost: 10.50,
              totalTokens: 40000,
              requestCount: 4
            }
          },
          byDate: []
        }
      }),
      getLimits: vi.fn().mockReturnValue(null),
      getLimitStatus: vi.fn().mockReturnValue({}),
      setLimits: vi.fn(),
      loadRecentSessions: vi.fn().mockReturnValue([]),
      estimateCost: vi.fn().mockReturnValue({
        inputCost: 3.00,
        outputCost: 7.50,
        totalCost: 10.50,
        currency: 'USD'
      }),
      exportData: vi.fn(),
      getTopExpensiveCommands: vi.fn().mockReturnValue([])
    }
    
    vi.mocked(CostTracker).mockImplementation(() => mockCostTracker)
    
    // Mock console.log to avoid output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('should show help when no command provided', async () => {
    await handleCostsCommand([])
    
    expect(console.log).toHaveBeenCalledWith('Cost tracking commands:')
  })

  it('should show usage statistics', async () => {
    await handleCostsCommand(['stats'])
    
    expect(mockCostTracker.getUsageStats).toHaveBeenCalledWith({})
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage Statistics'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$25.50'))
  })

  it('should show stats with provider filter', async () => {
    await handleCostsCommand(['stats', '--provider=claude-code'])
    
    expect(mockCostTracker.getUsageStats).toHaveBeenCalledWith({
      provider: 'claude-code'
    })
  })

  it('should show stats with project filter', async () => {
    await handleCostsCommand(['stats', '--project=my-project'])
    
    expect(mockCostTracker.getUsageStats).toHaveBeenCalledWith({
      project: 'my-project'
    })
  })

  it('should show stats with days filter', async () => {
    await handleCostsCommand(['stats', '--days=7'])
    
    expect(mockCostTracker.getUsageStats).toHaveBeenCalledWith({
      startDate: expect.any(String)
    })
  })

  it('should show stats with limit status when limits are set', async () => {
    mockCostTracker.getLimits.mockReturnValue({
      daily: 10.00,
      weekly: 50.00,
      currency: 'USD'
    })
    mockCostTracker.getLimitStatus.mockReturnValue({
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
      }
    })
    
    await handleCostsCommand(['stats'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Limit Status'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$8.50'))
  })

  it('should show current limits when no limit args provided', async () => {
    mockCostTracker.getLimits.mockReturnValue({
      daily: 10.00,
      weekly: 50.00,
      monthly: 200.00,
      currency: 'USD'
    })
    mockCostTracker.getLimitStatus.mockReturnValue({
      daily: { used: 5.00, limit: 10.00, percentage: 50, exceeded: false }
    })
    
    await handleCostsCommand(['limits'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cost Limits'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$10.00'))
  })

  it('should show message when no limits are set', async () => {
    mockCostTracker.getLimits.mockReturnValue(null)
    
    await handleCostsCommand(['limits'])
    
    expect(console.log).toHaveBeenCalledWith('No cost limits set.')
  })

  it('should set daily limit', async () => {
    const { log } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['limits', '--daily=15.00'])
    
    expect(mockCostTracker.setLimits).toHaveBeenCalledWith({
      daily: 15.00
    })
    expect(log).toHaveBeenCalledWith('✅ Cost limits updated:')
  })

  it('should set multiple limits', async () => {
    await handleCostsCommand(['limits', '--daily=10.00', '--weekly=70.00', '--monthly=300.00'])
    
    expect(mockCostTracker.setLimits).toHaveBeenCalledWith({
      daily: 10.00,
      weekly: 70.00,
      monthly: 300.00
    })
  })

  it('should warn for invalid daily limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['limits', '--daily=invalid'])
    
    expect(warn).toHaveBeenCalledWith('Daily limit must be a positive number')
  })

  it('should warn for negative weekly limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['limits', '--weekly=-5.00'])
    
    expect(warn).toHaveBeenCalledWith('Weekly limit must be a positive number')
  })

  it('should show usage history', async () => {
    const mockSessions = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        provider: 'claude-code',
        model: 'claude-3-5-sonnet-20241022',
        command: 'code review',
        usage: { totalTokens: 5000 },
        cost: { totalCost: 2.50 },
        metadata: {
          project: 'test-project',
          success: true,
          duration: 3000
        }
      },
      {
        timestamp: '2024-01-01T11:00:00Z',
        provider: 'gemini',
        usage: { totalTokens: 2000 },
        cost: { totalCost: 1.00 },
        metadata: {
          success: false,
          errorType: 'timeout'
        }
      }
    ]
    
    mockCostTracker.loadRecentSessions.mockReturnValue(mockSessions)
    
    await handleCostsCommand(['history'])
    
    expect(mockCostTracker.loadRecentSessions).toHaveBeenCalledWith(20)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Usage History'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('claude-code'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('code review'))
  })

  it('should show history with custom limit', async () => {
    await handleCostsCommand(['history', '--limit=50'])
    
    expect(mockCostTracker.loadRecentSessions).toHaveBeenCalledWith(50)
  })

  it('should warn for invalid history limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['history', '--limit=invalid'])
    
    expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
  })

  it('should show message when no history found', async () => {
    mockCostTracker.loadRecentSessions.mockReturnValue([])
    
    await handleCostsCommand(['history'])
    
    expect(console.log).toHaveBeenCalledWith('No usage history found.')
  })

  it('should estimate cost correctly', async () => {
    await handleCostsCommand(['estimate', 'claude-code', '1000000', '500000', 'claude-3-5-sonnet-20241022'])
    
    expect(mockCostTracker.estimateCost).toHaveBeenCalledWith('claude-code', 1000000, 500000, 'claude-3-5-sonnet-20241022')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cost Estimate'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$10.50'))
  })

  it('should estimate cost without model', async () => {
    await handleCostsCommand(['estimate', 'gemini', '500000', '250000'])
    
    expect(mockCostTracker.estimateCost).toHaveBeenCalledWith('gemini', 500000, 250000, undefined)
  })

  it('should warn for missing estimate arguments', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['estimate', 'claude-code'])
    
    expect(warn).toHaveBeenCalledWith('Usage: coda costs estimate <provider> <input_tokens> <output_tokens> [model]')
  })

  it('should warn for invalid input tokens', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['estimate', 'claude-code', 'invalid', '1000'])
    
    expect(warn).toHaveBeenCalledWith('Input tokens must be a non-negative number')
  })

  it('should warn for negative output tokens', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['estimate', 'claude-code', '1000', '-500'])
    
    expect(warn).toHaveBeenCalledWith('Output tokens must be a non-negative number')
  })

  it('should show warning for unknown provider in estimate', async () => {
    mockCostTracker.estimateCost.mockReturnValue({
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      currency: 'USD'
    })
    
    await handleCostsCommand(['estimate', 'unknown-provider', '1000', '500'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No pricing information available'))
  })

  it('should export data to file', async () => {
    const { log } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['export', '/test/export.json'])
    
    expect(mockCostTracker.exportData).toHaveBeenCalledWith('/test/export.json', {})
    expect(log).toHaveBeenCalledWith('✅ Usage data exported to: /test/export.json')
  })

  it('should export data with date range', async () => {
    const { log } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['export', '/test/export.json', '--start=2024-01-01', '--end=2024-01-31'])
    
    expect(mockCostTracker.exportData).toHaveBeenCalledWith('/test/export.json', {
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Date range'))
  })

  it('should warn when no export file provided', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['export'])
    
    expect(warn).toHaveBeenCalledWith('Please provide an output file path')
  })

  it('should warn for invalid start date format', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['export', '/test/export.json', '--start=invalid-date'])
    
    expect(warn).toHaveBeenCalledWith('Start date must be in YYYY-MM-DD format')
  })

  it('should warn for invalid end date format', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['export', '/test/export.json', '--end=2024/01/01'])
    
    expect(warn).toHaveBeenCalledWith('End date must be in YYYY-MM-DD format')
  })

  it('should show top expensive commands', async () => {
    const mockTopCommands = [
      {
        command: 'code-review',
        provider: 'claude-code',
        totalCost: 25.50,
        totalRequests: 10,
        averageCost: 2.55
      },
      {
        command: 'documentation',
        provider: 'gemini',
        totalCost: 15.00,
        totalRequests: 8,
        averageCost: 1.875
      }
    ]
    
    mockCostTracker.getTopExpensiveCommands.mockReturnValue(mockTopCommands)
    
    await handleCostsCommand(['top'])
    
    expect(mockCostTracker.getTopExpensiveCommands).toHaveBeenCalledWith(10)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Most Expensive Commands'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('code-review'))
  })

  it('should show top commands with custom limit', async () => {
    await handleCostsCommand(['top', '--limit=5'])
    
    expect(mockCostTracker.getTopExpensiveCommands).toHaveBeenCalledWith(5)
  })

  it('should warn for invalid top commands limit', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['top', '--limit=0'])
    
    expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
  })

  it('should show message when no command data found', async () => {
    mockCostTracker.getTopExpensiveCommands.mockReturnValue([])
    
    await handleCostsCommand(['top'])
    
    expect(console.log).toHaveBeenCalledWith('No command usage data found.')
  })

  it('should show pricing information', async () => {
    await handleCostsCommand(['pricing'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Current Pricing'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('CLAUDE-CODE'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('GEMINI'))
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleCostsCommand(['unknown'])
    
    expect(warn).toHaveBeenCalledWith('Unknown costs command: unknown')
  })

  it('should handle stats errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.getUsageStats.mockImplementation(() => {
      throw new Error('Stats failed')
    })
    
    await handleCostsCommand(['stats'])
    
    expect(warn).toHaveBeenCalledWith('Failed to get usage statistics: Stats failed')
  })

  it('should handle limits errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.setLimits.mockImplementation(() => {
      throw new Error('Limits failed')
    })
    
    await handleCostsCommand(['limits', '--daily=10.00'])
    
    expect(warn).toHaveBeenCalledWith('Failed to manage cost limits: Limits failed')
  })

  it('should handle history errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.loadRecentSessions.mockImplementation(() => {
      throw new Error('History failed')
    })
    
    await handleCostsCommand(['history'])
    
    expect(warn).toHaveBeenCalledWith('Failed to show usage history: History failed')
  })

  it('should handle estimate errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.estimateCost.mockImplementation(() => {
      throw new Error('Estimate failed')
    })
    
    await handleCostsCommand(['estimate', 'claude-code', '1000', '500'])
    
    expect(warn).toHaveBeenCalledWith('Failed to estimate cost: Estimate failed')
  })

  it('should handle export errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.exportData.mockImplementation(() => {
      throw new Error('Export failed')
    })
    
    await handleCostsCommand(['export', '/test/export.json'])
    
    expect(warn).toHaveBeenCalledWith('Failed to export data: Export failed')
  })

  it('should handle top commands errors', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    mockCostTracker.getTopExpensiveCommands.mockImplementation(() => {
      throw new Error('Top commands failed')
    })
    
    await handleCostsCommand(['top'])
    
    expect(warn).toHaveBeenCalledWith('Failed to show top commands: Top commands failed')
  })

  it('should format currency correctly in output', async () => {
    // Test small amounts with more decimal places
    mockCostTracker.getUsageStats.mockReturnValue({
      totalCost: 0.0025,
      totalTokens: 1000,
      totalRequests: 1,
      averageCostPerRequest: 0.0025,
      averageTokensPerRequest: 1000,
      breakdown: { byProvider: {}, byProject: {}, byDate: [] }
    })
    
    await handleCostsCommand(['stats'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('$0.0025'))
  })

  it('should show provider colors in history', async () => {
    const mockSessions = [
      {
        timestamp: '2024-01-01T10:00:00Z',
        provider: 'claude-code',
        usage: { totalTokens: 1000 },
        cost: { totalCost: 1.00 },
        metadata: { success: true }
      }
    ]
    
    mockCostTracker.loadRecentSessions.mockReturnValue(mockSessions)
    
    await handleCostsCommand(['history'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('\\x1b[34m'))
  })
})