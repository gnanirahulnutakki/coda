import { CostTracker, PROVIDER_PRICING } from '../features/cost-tracker.js'
import { log, warn } from '../utils/logging.js'

export async function handleCostsCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command) {
    console.log('Cost tracking commands:')
    console.log(
      '  coda costs stats [--provider=X] [--project=X] [--days=N]  - Show usage statistics',
    )
    console.log(
      '  coda costs limits [--daily=X] [--weekly=X] [--monthly=X]   - Set or view cost limits',
    )
    console.log(
      '  coda costs history [--limit=N]                            - Show recent usage history',
    )
    console.log(
      '  coda costs estimate <provider> <input> <output> [model]   - Estimate cost for token usage',
    )
    console.log(
      '  coda costs export <file> [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] - Export usage data',
    )
    console.log(
      '  coda costs top [--limit=N]                                - Show most expensive commands',
    )
    console.log(
      '  coda costs pricing                                        - Show current pricing information',
    )
    return
  }

  const costTracker = new CostTracker()

  switch (command) {
    case 'stats':
      await showStats(costTracker, args.slice(1))
      break
    case 'limits':
      await manageLimits(costTracker, args.slice(1))
      break
    case 'history':
      await showHistory(costTracker, args.slice(1))
      break
    case 'estimate':
      await estimateCost(costTracker, args.slice(1))
      break
    case 'export':
      await exportData(costTracker, args.slice(1))
      break
    case 'top':
      await showTopCommands(costTracker, args.slice(1))
      break
    case 'pricing':
      await showPricing()
      break
    default:
      warn(`Unknown costs command: ${command}`)
      break
  }
}

async function showStats(costTracker: CostTracker, args: string[]): Promise<void> {
  try {
    const providerArg = args.find((arg) => arg.startsWith('--provider='))
    const projectArg = args.find((arg) => arg.startsWith('--project='))
    const daysArg = args.find((arg) => arg.startsWith('--days='))

    const provider = providerArg?.split('=')[1]
    const project = projectArg?.split('=')[1]
    const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : undefined

    let startDate: string | undefined
    if (days && !isNaN(days) && days > 0) {
      const date = new Date()
      date.setDate(date.getDate() - days)
      startDate = date.toISOString().split('T')[0]
    }

    const stats = costTracker.getUsageStats({
      startDate,
      provider,
      project,
    })

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                   Usage Statistics                   ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    // Overall stats
    console.log(`\\x1b[33mOverall Usage${days ? ` (Last ${days} days)` : ''}:\\x1b[0m`)
    console.log(`  💰 Total Cost: ${formatCurrency(stats.totalCost)}`)
    console.log(`  🔢 Total Tokens: ${stats.totalTokens.toLocaleString()}`)
    console.log(`  📞 Total Requests: ${stats.totalRequests.toLocaleString()}`)
    console.log(`  💸 Average Cost/Request: ${formatCurrency(stats.averageCostPerRequest)}`)
    console.log(
      `  📊 Average Tokens/Request: ${Math.round(stats.averageTokensPerRequest).toLocaleString()}`,
    )

    // Provider breakdown
    if (Object.keys(stats.breakdown.byProvider).length > 0) {
      console.log(`\\n\\x1b[33mBy Provider:\\x1b[0m`)
      Object.entries(stats.breakdown.byProvider)
        .sort(([, a], [, b]) => b.totalCost - a.totalCost)
        .forEach(([providerName, providerStats]) => {
          console.log(`  \\x1b[32m${providerName}\\x1b[0m:`)
          console.log(`    💰 Cost: ${formatCurrency(providerStats.totalCost)}`)
          console.log(`    🔢 Tokens: ${providerStats.totalTokens.toLocaleString()}`)
          console.log(`    📞 Requests: ${providerStats.requestCount.toLocaleString()}`)
        })
    }

    // Project breakdown
    if (Object.keys(stats.breakdown.byProject).length > 0) {
      console.log(`\\n\\x1b[33mBy Project:\\x1b[0m`)
      Object.entries(stats.breakdown.byProject)
        .sort(([, a], [, b]) => b.totalCost - a.totalCost)
        .slice(0, 10) // Top 10 projects
        .forEach(([projectName, projectStats]) => {
          console.log(`  \\x1b[32m${projectName}\\x1b[0m:`)
          console.log(`    💰 Cost: ${formatCurrency(projectStats.totalCost)}`)
          console.log(`    🔢 Tokens: ${projectStats.totalTokens.toLocaleString()}`)
          console.log(`    📞 Requests: ${projectStats.requestCount.toLocaleString()}`)
        })
    }

    // Show limit status if limits are set
    const limits = costTracker.getLimits()
    if (limits) {
      console.log(`\\n\\x1b[33mLimit Status:\\x1b[0m`)
      const status = costTracker.getLimitStatus()

      if (status.daily) {
        const color = status.daily.exceeded
          ? '\\x1b[31m'
          : status.daily.percentage > 80
            ? '\\x1b[33m'
            : '\\x1b[32m'
        console.log(
          `  📅 Daily: ${color}${formatCurrency(status.daily.used)}\\x1b[0m / ${formatCurrency(status.daily.limit)} (${Math.round(status.daily.percentage)}%)`,
        )
      }

      if (status.weekly) {
        const color = status.weekly.exceeded
          ? '\\x1b[31m'
          : status.weekly.percentage > 80
            ? '\\x1b[33m'
            : '\\x1b[32m'
        console.log(
          `  📅 Weekly: ${color}${formatCurrency(status.weekly.used)}\\x1b[0m / ${formatCurrency(status.weekly.limit)} (${Math.round(status.weekly.percentage)}%)`,
        )
      }

      if (status.monthly) {
        const color = status.monthly.exceeded
          ? '\\x1b[31m'
          : status.monthly.percentage > 80
            ? '\\x1b[33m'
            : '\\x1b[32m'
        console.log(
          `  📅 Monthly: ${color}${formatCurrency(status.monthly.used)}\\x1b[0m / ${formatCurrency(status.monthly.limit)} (${Math.round(status.monthly.percentage)}%)`,
        )
      }
    }
  } catch (error) {
    warn(`Failed to get usage statistics: ${error.message}`)
  }
}

async function manageLimits(costTracker: CostTracker, args: string[]): Promise<void> {
  try {
    const dailyArg = args.find((arg) => arg.startsWith('--daily='))
    const weeklyArg = args.find((arg) => arg.startsWith('--weekly='))
    const monthlyArg = args.find((arg) => arg.startsWith('--monthly='))

    if (!dailyArg && !weeklyArg && !monthlyArg) {
      // Show current limits
      const limits = costTracker.getLimits()

      if (!limits) {
        console.log('No cost limits set.')
        console.log('\\nSet limits with:')
        console.log('  coda costs limits --daily=10.00 --weekly=50.00 --monthly=200.00')
        return
      }

      console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
      console.log(`\\x1b[36m║                    Cost Limits                       ║\\x1b[0m`)
      console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

      if (limits.daily !== undefined) {
        console.log(`📅 Daily Limit: ${formatCurrency(limits.daily)}`)
      }
      if (limits.weekly !== undefined) {
        console.log(`📅 Weekly Limit: ${formatCurrency(limits.weekly)}`)
      }
      if (limits.monthly !== undefined) {
        console.log(`📅 Monthly Limit: ${formatCurrency(limits.monthly)}`)
      }

      // Show current usage against limits
      const status = costTracker.getLimitStatus()
      if (Object.keys(status).length > 0) {
        console.log(`\\n\\x1b[33mCurrent Usage:\\x1b[0m`)

        if (status.daily) {
          const color = status.daily.exceeded ? '\\x1b[31m' : '\\x1b[32m'
          console.log(
            `📅 Today: ${color}${formatCurrency(status.daily.used)}\\x1b[0m (${Math.round(status.daily.percentage)}% of limit)`,
          )
        }
        if (status.weekly) {
          const color = status.weekly.exceeded ? '\\x1b[31m' : '\\x1b[32m'
          console.log(
            `📅 This Week: ${color}${formatCurrency(status.weekly.used)}\\x1b[0m (${Math.round(status.weekly.percentage)}% of limit)`,
          )
        }
        if (status.monthly) {
          const color = status.monthly.exceeded ? '\\x1b[31m' : '\\x1b[32m'
          console.log(
            `📅 This Month: ${color}${formatCurrency(status.monthly.used)}\\x1b[0m (${Math.round(status.monthly.percentage)}% of limit)`,
          )
        }
      }

      return
    }

    // Set new limits
    const newLimits: any = {}

    if (dailyArg) {
      const daily = parseFloat(dailyArg.split('=')[1])
      if (isNaN(daily) || daily <= 0) {
        warn('Daily limit must be a positive number')
        return
      }
      newLimits.daily = daily
    }

    if (weeklyArg) {
      const weekly = parseFloat(weeklyArg.split('=')[1])
      if (isNaN(weekly) || weekly <= 0) {
        warn('Weekly limit must be a positive number')
        return
      }
      newLimits.weekly = weekly
    }

    if (monthlyArg) {
      const monthly = parseFloat(monthlyArg.split('=')[1])
      if (isNaN(monthly) || monthly <= 0) {
        warn('Monthly limit must be a positive number')
        return
      }
      newLimits.monthly = monthly
    }

    costTracker.setLimits(newLimits)

    log('✅ Cost limits updated:')
    if (newLimits.daily !== undefined) {
      log(`  📅 Daily: ${formatCurrency(newLimits.daily)}`)
    }
    if (newLimits.weekly !== undefined) {
      log(`  📅 Weekly: ${formatCurrency(newLimits.weekly)}`)
    }
    if (newLimits.monthly !== undefined) {
      log(`  📅 Monthly: ${formatCurrency(newLimits.monthly)}`)
    }
  } catch (error) {
    warn(`Failed to manage cost limits: ${error.message}`)
  }
}

async function showHistory(costTracker: CostTracker, args: string[]): Promise<void> {
  try {
    const limitArg = args.find((arg) => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20

    if (limitArg && (isNaN(limit) || limit <= 0)) {
      warn('Limit must be a positive number')
      return
    }

    const sessions = costTracker.loadRecentSessions(limit)

    if (sessions.length === 0) {
      console.log('No usage history found.')
      return
    }

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                   Usage History                      ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    console.log(`\\x1b[33mShowing last ${sessions.length} sessions:\\x1b[0m\\n`)

    sessions.reverse().forEach((session, index) => {
      const time = new Date(session.timestamp).toLocaleString()
      const cost = formatCurrency(session.cost.totalCost)
      const tokens = session.usage.totalTokens.toLocaleString()

      const statusIcon = session.metadata.success ? '✅' : '❌'
      const providerColor = session.provider === 'claude-code' ? '\\x1b[34m' : '\\x1b[35m'

      console.log(
        `${index + 1}. ${statusIcon} [${time}] ${providerColor}${session.provider}\\x1b[0m`,
      )

      if (session.model) {
        console.log(`   🤖 Model: ${session.model}`)
      }
      if (session.command) {
        console.log(`   💻 Command: ${session.command}`)
      }
      if (session.metadata.project) {
        console.log(`   📁 Project: ${session.metadata.project}`)
      }

      console.log(`   💰 Cost: ${cost} | 🔢 Tokens: ${tokens}`)

      if (session.metadata.duration) {
        console.log(`   ⏱️ Duration: ${(session.metadata.duration / 1000).toFixed(1)}s`)
      }

      if (!session.metadata.success && session.metadata.errorType) {
        console.log(`   ❌ Error: ${session.metadata.errorType}`)
      }

      console.log()
    })
  } catch (error) {
    warn(`Failed to show usage history: ${error.message}`)
  }
}

async function estimateCost(costTracker: CostTracker, args: string[]): Promise<void> {
  if (args.length < 3) {
    warn('Usage: coda costs estimate <provider> <input_tokens> <output_tokens> [model]')
    warn('Example: coda costs estimate claude-code 10000 5000 claude-3-5-sonnet-20241022')
    return
  }

  const provider = args[0]
  const inputTokens = parseInt(args[1], 10)
  const outputTokens = parseInt(args[2], 10)
  const model = args[3]

  if (isNaN(inputTokens) || inputTokens < 0) {
    warn('Input tokens must be a non-negative number')
    return
  }

  if (isNaN(outputTokens) || outputTokens < 0) {
    warn('Output tokens must be a non-negative number')
    return
  }

  try {
    const cost = costTracker.estimateCost(provider, inputTokens, outputTokens, model)

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                   Cost Estimate                     ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    console.log(`\\x1b[33mProvider:\\x1b[0m ${provider}`)
    if (model) {
      console.log(`\\x1b[33mModel:\\x1b[0m ${model}`)
    }
    console.log(`\\x1b[33mInput Tokens:\\x1b[0m ${inputTokens.toLocaleString()}`)
    console.log(`\\x1b[33mOutput Tokens:\\x1b[0m ${outputTokens.toLocaleString()}`)
    console.log(`\\x1b[33mTotal Tokens:\\x1b[0m ${(inputTokens + outputTokens).toLocaleString()}`)

    console.log(`\\n\\x1b[33mCost Breakdown:\\x1b[0m`)
    console.log(`  📥 Input Cost: ${formatCurrency(cost.inputCost)}`)
    console.log(`  📤 Output Cost: ${formatCurrency(cost.outputCost)}`)
    console.log(`  \\x1b[32m💰 Total Cost: ${formatCurrency(cost.totalCost)}\\x1b[0m`)

    if (cost.totalCost === 0) {
      console.log(`\\n\\x1b[33m⚠️ No pricing information available for provider "${provider}"`)
      if (model) {
        console.log(`   or model "${model}"\\x1b[0m`)
      } else {
        console.log(`   Try specifying a model name.\\x1b[0m`)
      }
    }
  } catch (error) {
    warn(`Failed to estimate cost: ${error.message}`)
  }
}

async function exportData(costTracker: CostTracker, args: string[]): Promise<void> {
  if (args.length === 0) {
    warn('Please provide an output file path')
    warn('Usage: coda costs export <file> [--start=YYYY-MM-DD] [--end=YYYY-MM-DD]')
    return
  }

  const outputPath = args[0]
  const startArg = args.find((arg) => arg.startsWith('--start='))
  const endArg = args.find((arg) => arg.startsWith('--end='))

  const startDate = startArg?.split('=')[1]
  const endDate = endArg?.split('=')[1]

  // Validate dates
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    warn('Start date must be in YYYY-MM-DD format')
    return
  }

  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    warn('End date must be in YYYY-MM-DD format')
    return
  }

  try {
    await costTracker.exportData(outputPath, { startDate, endDate })

    log(`✅ Usage data exported to: ${outputPath}`)

    if (startDate || endDate) {
      log(`   📅 Date range: ${startDate || 'beginning'} to ${endDate || 'now'}`)
    }
  } catch (error) {
    warn(`Failed to export data: ${error.message}`)
  }
}

async function showTopCommands(costTracker: CostTracker, args: string[]): Promise<void> {
  try {
    const limitArg = args.find((arg) => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

    if (limitArg && (isNaN(limit) || limit <= 0)) {
      warn('Limit must be a positive number')
      return
    }

    const topCommands = costTracker.getTopExpensiveCommands(limit)

    if (topCommands.length === 0) {
      console.log('No command usage data found.')
      return
    }

    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                Most Expensive Commands              ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

    topCommands.forEach((cmd, index) => {
      const providerColor = cmd.provider === 'claude-code' ? '\\x1b[34m' : '\\x1b[35m'

      console.log(
        `${index + 1}. \\x1b[33m${cmd.command}\\x1b[0m (${providerColor}${cmd.provider}\\x1b[0m)`,
      )
      console.log(`   💰 Total Cost: ${formatCurrency(cmd.totalCost)}`)
      console.log(`   📞 Requests: ${cmd.totalRequests.toLocaleString()}`)
      console.log(`   💸 Average Cost: ${formatCurrency(cmd.averageCost)}`)
      console.log()
    })
  } catch (error) {
    warn(`Failed to show top commands: ${error.message}`)
  }
}

async function showPricing(): Promise<void> {
  console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
  console.log(`\\x1b[36m║                Current Pricing (per 1M tokens)      ║\\x1b[0m`)
  console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)

  for (const [provider, models] of Object.entries(PROVIDER_PRICING)) {
    const providerColor = provider === 'claude-code' ? '\\x1b[34m' : '\\x1b[35m'
    console.log(`${providerColor}${provider.toUpperCase()}\\x1b[0m:`)

    for (const [model, pricing] of Object.entries(models)) {
      console.log(`  \\x1b[33m${model}\\x1b[0m:`)
      console.log(`    📥 Input: ${formatCurrency(pricing.input)}`)
      console.log(`    📤 Output: ${formatCurrency(pricing.output)}`)
    }
    console.log()
  }

  console.log(
    `\\x1b[90m* Prices are subject to change. Check provider documentation for latest rates.\\x1b[0m`,
  )
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount < 1 ? 4 : 2,
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount)
}
