import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_PATHS } from '../config/paths.js'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestCount: number
}

export interface CostInfo {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: string
}

export interface UsageSession {
  id: string
  timestamp: string
  provider: string
  model?: string
  command?: string
  usage: TokenUsage
  cost: CostInfo
  metadata: {
    project?: string
    cwd?: string
    duration?: number
    success: boolean
    errorType?: string
  }
}

export interface DailySummary {
  date: string
  totalCost: number
  totalTokens: number
  totalRequests: number
  providers: { [provider: string]: TokenUsage & CostInfo }
  projects: { [project: string]: TokenUsage & CostInfo }
}

export interface CostLimits {
  daily?: number
  weekly?: number
  monthly?: number
  currency: string
}

// Pricing information per provider (per 1M tokens)
export const PROVIDER_PRICING = {
  'claude-code': {
    'claude-3-5-sonnet-20241022': {
      input: 3.00,   // $3 per 1M input tokens
      output: 15.00, // $15 per 1M output tokens
      currency: 'USD'
    },
    'claude-3-haiku-20240307': {
      input: 0.25,   // $0.25 per 1M input tokens
      output: 1.25,  // $1.25 per 1M output tokens
      currency: 'USD'
    },
    'claude-3-opus-20240229': {
      input: 15.00,  // $15 per 1M input tokens
      output: 75.00, // $75 per 1M output tokens
      currency: 'USD'
    }
  },
  'gemini': {
    'gemini-1.5-pro': {
      input: 3.50,   // $3.50 per 1M input tokens
      output: 10.50, // $10.50 per 1M output tokens
      currency: 'USD'
    },
    'gemini-1.5-flash': {
      input: 0.075,  // $0.075 per 1M input tokens
      output: 0.30,  // $0.30 per 1M output tokens
      currency: 'USD'
    }
  }
} as const

export class CostTracker {
  private dataDir: string
  private sessionsFile: string
  private summariesFile: string
  private limitsFile: string
  private sessions: UsageSession[] = []
  private limits: CostLimits | null = null

  constructor() {
    const configDir = CONFIG_PATHS.getConfigDirectory()
    this.dataDir = path.join(configDir, 'cost-tracking')
    this.sessionsFile = path.join(this.dataDir, 'sessions.jsonl')
    this.summariesFile = path.join(this.dataDir, 'daily-summaries.json')
    this.limitsFile = path.join(this.dataDir, 'limits.json')
    this.ensureDataDirectory()
    this.loadLimits()
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  private loadLimits(): void {
    if (fs.existsSync(this.limitsFile)) {
      try {
        const data = fs.readFileSync(this.limitsFile, 'utf8')
        this.limits = JSON.parse(data)
      } catch (error) {
        console.warn('Failed to load cost limits:', error.message)
        this.limits = null
      }
    }
  }

  private saveLimits(): void {
    if (this.limits) {
      fs.writeFileSync(this.limitsFile, JSON.stringify(this.limits, null, 2))
    }
  }

  private calculateCost(usage: TokenUsage, provider: string, model?: string): CostInfo {
    const pricing = PROVIDER_PRICING[provider as keyof typeof PROVIDER_PRICING]
    
    if (!pricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD'
      }
    }

    // Use provided model or default to the first available model for the provider
    const modelKey = model || Object.keys(pricing)[0]
    const modelPricing = pricing[modelKey as keyof typeof pricing]

    if (!modelPricing) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: 'USD'
      }
    }

    const inputCost = (usage.inputTokens / 1_000_000) * modelPricing.input
    const outputCost = (usage.outputTokens / 1_000_000) * modelPricing.output
    const totalCost = inputCost + outputCost

    return {
      inputCost,
      outputCost,
      totalCost,
      currency: modelPricing.currency
    }
  }

  recordUsage(
    provider: string,
    usage: TokenUsage,
    metadata: Partial<UsageSession['metadata']> = {},
    model?: string,
    command?: string
  ): string {
    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const timestamp = new Date().toISOString()
    const cost = this.calculateCost(usage, provider, model)

    const session: UsageSession = {
      id: sessionId,
      timestamp,
      provider,
      model,
      command,
      usage,
      cost,
      metadata: {
        project: path.basename(process.cwd()),
        cwd: process.cwd(),
        success: true,
        ...metadata
      }
    }

    // Append to sessions file (JSONL format)
    const sessionLine = JSON.stringify(session) + '\n'
    fs.appendFileSync(this.sessionsFile, sessionLine)

    // Update daily summary
    this.updateDailySummary(session)

    // Check limits
    this.checkLimits(session)

    return sessionId
  }

  private updateDailySummary(session: UsageSession): void {
    const date = session.timestamp.split('T')[0]
    const summaries = this.loadDailySummaries()
    
    let summary = summaries.find(s => s.date === date)
    if (!summary) {
      summary = {
        date,
        totalCost: 0,
        totalTokens: 0,
        totalRequests: 0,
        providers: {},
        projects: {}
      }
      summaries.push(summary)
    }

    // Update totals
    summary.totalCost += session.cost.totalCost
    summary.totalTokens += session.usage.totalTokens
    summary.totalRequests += 1

    // Update provider stats
    if (!summary.providers[session.provider]) {
      summary.providers[session.provider] = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: session.cost.currency
      }
    }
    
    const providerStats = summary.providers[session.provider]
    providerStats.inputTokens += session.usage.inputTokens
    providerStats.outputTokens += session.usage.outputTokens
    providerStats.totalTokens += session.usage.totalTokens
    providerStats.requestCount += 1
    providerStats.inputCost += session.cost.inputCost
    providerStats.outputCost += session.cost.outputCost
    providerStats.totalCost += session.cost.totalCost

    // Update project stats
    const projectName = session.metadata.project || 'unknown'
    if (!summary.projects[projectName]) {
      summary.projects[projectName] = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        currency: session.cost.currency
      }
    }
    
    const projectStats = summary.projects[projectName]
    projectStats.inputTokens += session.usage.inputTokens
    projectStats.outputTokens += session.usage.outputTokens
    projectStats.totalTokens += session.usage.totalTokens
    projectStats.requestCount += 1
    projectStats.inputCost += session.cost.inputCost
    projectStats.outputCost += session.cost.outputCost
    projectStats.totalCost += session.cost.totalCost

    // Keep only last 90 days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)
    const filteredSummaries = summaries.filter(s => new Date(s.date) >= cutoffDate)

    this.saveDailySummaries(filteredSummaries)
  }

  private loadDailySummaries(): DailySummary[] {
    if (fs.existsSync(this.summariesFile)) {
      try {
        const data = fs.readFileSync(this.summariesFile, 'utf8')
        return JSON.parse(data)
      } catch (error) {
        console.warn('Failed to load daily summaries:', error.message)
      }
    }
    return []
  }

  private saveDailySummaries(summaries: DailySummary[]): void {
    fs.writeFileSync(this.summariesFile, JSON.stringify(summaries, null, 2))
  }

  private checkLimits(session: UsageSession): void {
    if (!this.limits) return

    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Check daily limit
    if (this.limits.daily) {
      const todaysCost = this.getDailyCost(today)
      if (todaysCost >= this.limits.daily) {
        console.warn(`⚠️ Daily cost limit exceeded: ${this.formatCurrency(todaysCost)} / ${this.formatCurrency(this.limits.daily)}`)
      }
    }

    // Check weekly limit
    if (this.limits.weekly) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      const weeklyCost = this.getCostSince(weekStart)
      if (weeklyCost >= this.limits.weekly) {
        console.warn(`⚠️ Weekly cost limit exceeded: ${this.formatCurrency(weeklyCost)} / ${this.formatCurrency(this.limits.weekly)}`)
      }
    }

    // Check monthly limit
    if (this.limits.monthly) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthlyCost = this.getCostSince(monthStart)
      if (monthlyCost >= this.limits.monthly) {
        console.warn(`⚠️ Monthly cost limit exceeded: ${this.formatCurrency(monthlyCost)} / ${this.formatCurrency(this.limits.monthly)}`)
      }
    }
  }

  private formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(amount)
  }

  loadRecentSessions(limit: number = 100): UsageSession[] {
    if (!fs.existsSync(this.sessionsFile)) {
      return []
    }

    try {
      const data = fs.readFileSync(this.sessionsFile, 'utf8')
      const lines = data.trim().split('\n').filter(line => line.trim())
      
      // Get the last N lines
      const recentLines = lines.slice(-limit)
      return recentLines.map(line => JSON.parse(line))
    } catch (error) {
      console.warn('Failed to load recent sessions:', error.message)
      return []
    }
  }

  getDailyCost(date: string): number {
    const summaries = this.loadDailySummaries()
    const summary = summaries.find(s => s.date === date)
    return summary ? summary.totalCost : 0
  }

  getCostSince(date: Date): number {
    const summaries = this.loadDailySummaries()
    const dateStr = date.toISOString().split('T')[0]
    
    return summaries
      .filter(s => s.date >= dateStr)
      .reduce((total, s) => total + s.totalCost, 0)
  }

  getUsageStats(options: {
    startDate?: string
    endDate?: string
    provider?: string
    project?: string
  } = {}): {
    totalCost: number
    totalTokens: number
    totalRequests: number
    averageCostPerRequest: number
    averageTokensPerRequest: number
    breakdown: {
      byProvider: { [provider: string]: TokenUsage & CostInfo }
      byProject: { [project: string]: TokenUsage & CostInfo }
      byDate: DailySummary[]
    }
  } {
    const summaries = this.loadDailySummaries()
    let filteredSummaries = summaries

    // Apply date filters
    if (options.startDate) {
      filteredSummaries = filteredSummaries.filter(s => s.date >= options.startDate!)
    }
    if (options.endDate) {
      filteredSummaries = filteredSummaries.filter(s => s.date <= options.endDate!)
    }

    // Calculate totals
    const totalCost = filteredSummaries.reduce((sum, s) => sum + s.totalCost, 0)
    const totalTokens = filteredSummaries.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalRequests = filteredSummaries.reduce((sum, s) => sum + s.totalRequests, 0)

    // Aggregate breakdowns
    const byProvider: { [provider: string]: TokenUsage & CostInfo } = {}
    const byProject: { [project: string]: TokenUsage & CostInfo } = {}

    for (const summary of filteredSummaries) {
      // Aggregate by provider
      for (const [provider, stats] of Object.entries(summary.providers)) {
        if (options.provider && provider !== options.provider) continue
        
        if (!byProvider[provider]) {
          byProvider[provider] = {
            inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0,
            inputCost: 0, outputCost: 0, totalCost: 0, currency: stats.currency
          }
        }
        
        byProvider[provider].inputTokens += stats.inputTokens
        byProvider[provider].outputTokens += stats.outputTokens
        byProvider[provider].totalTokens += stats.totalTokens
        byProvider[provider].requestCount += stats.requestCount
        byProvider[provider].inputCost += stats.inputCost
        byProvider[provider].outputCost += stats.outputCost
        byProvider[provider].totalCost += stats.totalCost
      }

      // Aggregate by project
      for (const [project, stats] of Object.entries(summary.projects)) {
        if (options.project && project !== options.project) continue
        
        if (!byProject[project]) {
          byProject[project] = {
            inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0,
            inputCost: 0, outputCost: 0, totalCost: 0, currency: stats.currency
          }
        }
        
        byProject[project].inputTokens += stats.inputTokens
        byProject[project].outputTokens += stats.outputTokens
        byProject[project].totalTokens += stats.totalTokens
        byProject[project].requestCount += stats.requestCount
        byProject[project].inputCost += stats.inputCost
        byProject[project].outputCost += stats.outputCost
        byProject[project].totalCost += stats.totalCost
      }
    }

    return {
      totalCost,
      totalTokens,
      totalRequests,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      averageTokensPerRequest: totalRequests > 0 ? totalTokens / totalRequests : 0,
      breakdown: {
        byProvider,
        byProject,
        byDate: filteredSummaries
      }
    }
  }

  setLimits(limits: Partial<CostLimits>): void {
    this.limits = { 
      ...this.limits, 
      currency: 'USD',
      ...limits 
    }
    this.saveLimits()
  }

  getLimits(): CostLimits | null {
    return this.limits
  }

  getLimitStatus(): {
    daily?: { used: number; limit: number; percentage: number; exceeded: boolean }
    weekly?: { used: number; limit: number; percentage: number; exceeded: boolean }
    monthly?: { used: number; limit: number; percentage: number; exceeded: boolean }
  } {
    if (!this.limits) return {}

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    
    const result: any = {}

    if (this.limits.daily) {
      const used = this.getDailyCost(today)
      result.daily = {
        used,
        limit: this.limits.daily,
        percentage: (used / this.limits.daily) * 100,
        exceeded: used >= this.limits.daily
      }
    }

    if (this.limits.weekly) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      const used = this.getCostSince(weekStart)
      result.weekly = {
        used,
        limit: this.limits.weekly,
        percentage: (used / this.limits.weekly) * 100,
        exceeded: used >= this.limits.weekly
      }
    }

    if (this.limits.monthly) {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const used = this.getCostSince(monthStart)
      result.monthly = {
        used,
        limit: this.limits.monthly,
        percentage: (used / this.limits.monthly) * 100,
        exceeded: used >= this.limits.monthly
      }
    }

    return result
  }

  exportData(outputPath: string, options: { startDate?: string; endDate?: string } = {}): void {
    const sessions = this.loadRecentSessions(10000) // Load more for export
    let filteredSessions = sessions

    if (options.startDate) {
      filteredSessions = filteredSessions.filter(s => s.timestamp.split('T')[0] >= options.startDate!)
    }
    if (options.endDate) {
      filteredSessions = filteredSessions.filter(s => s.timestamp.split('T')[0] <= options.endDate!)
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      filters: options,
      sessions: filteredSessions,
      summaries: this.loadDailySummaries(),
      limits: this.limits
    }

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2))
  }

  estimateCost(provider: string, inputTokens: number, outputTokens: number, model?: string): CostInfo {
    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      requestCount: 1
    }

    return this.calculateCost(usage, provider, model)
  }

  getTopExpensiveCommands(limit: number = 10): Array<{
    command: string
    totalCost: number
    totalRequests: number
    averageCost: number
    provider: string
  }> {
    const sessions = this.loadRecentSessions(1000)
    const commandStats = new Map<string, {
      totalCost: number
      totalRequests: number
      provider: string
    }>()

    for (const session of sessions) {
      if (!session.command) continue
      
      const key = `${session.command}-${session.provider}`
      const existing = commandStats.get(key) || {
        totalCost: 0,
        totalRequests: 0,
        provider: session.provider
      }

      existing.totalCost += session.cost.totalCost
      existing.totalRequests += 1
      commandStats.set(key, existing)
    }

    return Array.from(commandStats.entries())
      .map(([key, stats]) => ({
        command: key.split('-')[0],
        provider: stats.provider,
        totalCost: stats.totalCost,
        totalRequests: stats.totalRequests,
        averageCost: stats.totalCost / stats.totalRequests
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit)
  }
}