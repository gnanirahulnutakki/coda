import * as path from 'path'
import { SecurityScanner } from '../features/security-scanner.js'
import { log, warn } from '../utils/logging.js'

export async function handleSecurityCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command) {
    console.log('Security scanning commands:')
    console.log('  coda security scan [directory] [--exclude=pattern] [--include=pattern] [--format=json|csv|html]  - Scan directory for security issues')
    console.log('  coda security list [--limit=N]                                                                  - List recent scan results')
    console.log('  coda security show <scan-id>                                                                    - Show detailed scan results')
    console.log('  coda security export <scan-id> <output-file>                                                    - Export scan results')
    console.log('  coda security delete <scan-id>                                                                  - Delete scan results')
    console.log('  coda security rules                                                                             - List security rules')
    return
  }

  const securityScanner = new SecurityScanner()

  switch (command) {
    case 'scan':
      await performScan(securityScanner, args.slice(1))
      break
    case 'list':
      await listScans(securityScanner, args.slice(1))
      break
    case 'show':
      await showScan(securityScanner, args.slice(1))
      break
    case 'export':
      await exportScan(securityScanner, args.slice(1))
      break
    case 'delete':
      await deleteScan(securityScanner, args.slice(1))
      break
    case 'rules':
      await showRules()
      break
    default:
      warn(`Unknown security command: ${command}`)
      break
  }
}

async function performScan(scanner: SecurityScanner, args: string[]): Promise<void> {
  try {
    const directoryArg = args.find(arg => !arg.startsWith('--'))
    const directory = directoryArg || process.cwd()
    
    const excludeArgs = args.filter(arg => arg.startsWith('--exclude='))
    const includeArgs = args.filter(arg => arg.startsWith('--include='))
    const formatArg = args.find(arg => arg.startsWith('--format='))
    const maxSizeArg = args.find(arg => arg.startsWith('--max-size='))
    
    const excludePatterns = excludeArgs.map(arg => arg.split('=')[1])
    const includePatterns = includeArgs.map(arg => arg.split('=')[1])
    const format = formatArg?.split('=')[1] || 'console'
    
    let maxFileSize = 10 * 1024 * 1024 // 10MB default
    if (maxSizeArg) {
      const sizeStr = maxSizeArg.split('=')[1]
      const sizeMatch = sizeStr.match(/^(\d+)([kmg]?b?)?$/i)
      if (sizeMatch) {
        const value = parseInt(sizeMatch[1], 10)
        const unit = (sizeMatch[2] || '').toLowerCase()
        switch (unit) {
          case 'kb':
          case 'k':
            maxFileSize = value * 1024
            break
          case 'mb':
          case 'm':
            maxFileSize = value * 1024 * 1024
            break
          case 'gb':
          case 'g':
            maxFileSize = value * 1024 * 1024 * 1024
            break
          default:
            maxFileSize = value
        }
      }
    }
    
    console.log(`🔍 Starting security scan of: ${directory}`)
    if (excludePatterns.length > 0) {
      console.log(`   Excluding: ${excludePatterns.join(', ')}`)
    }
    if (includePatterns.length > 0) {
      console.log(`   Including: ${includePatterns.join(', ')}`)
    }
    console.log(`   Max file size: ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`)
    console.log()
    
    const startTime = Date.now()
    const result = await scanner.scanDirectory(directory, {
      excludePatterns: excludePatterns.length > 0 ? excludePatterns : undefined,
      includePatterns: includePatterns.length > 0 ? includePatterns : undefined,
      maxFileSize
    })
    
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2))
      return
    }
    
    // Console output
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                Security Scan Results                ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[33mScan Summary:\\x1b[0m`)
    console.log(`  🆔 Scan ID: ${result.scanId}`)
    console.log(`  📁 Files Scanned: ${result.scannedFiles.length}`)
    console.log(`  ⏱️ Duration: ${(result.scanDuration / 1000).toFixed(2)}s`)
    console.log()
    
    // Issue counts by severity
    const severityColors = {
      critical: '\\x1b[31m', // Red
      high: '\\x1b[33m',     // Yellow
      medium: '\\x1b[34m',   // Blue
      low: '\\x1b[32m'       // Green
    }
    
    console.log(`\\x1b[33mIssues Found:\\x1b[0m`)
    console.log(`  ${severityColors.critical}🚨 Critical: ${result.criticalIssues}\\x1b[0m`)
    console.log(`  ${severityColors.high}⚠️ High: ${result.highIssues}\\x1b[0m`)
    console.log(`  ${severityColors.medium}ℹ️ Medium: ${result.mediumIssues}\\x1b[0m`)
    console.log(`  ${severityColors.low}✅ Low: ${result.lowIssues}\\x1b[0m`)
    console.log(`  📊 Total: ${result.totalIssues}`)
    console.log()
    
    if (result.issues.length > 0) {
      console.log(`\\x1b[33mDetailed Issues:\\x1b[0m`)
      
      // Group issues by file for better readability
      const issuesByFile = result.issues.reduce((acc, issue) => {
        const file = issue.file
        if (!acc[file]) {
          acc[file] = []
        }
        acc[file].push(issue)
        return acc
      }, {} as Record<string, typeof result.issues>)
      
      for (const [file, fileIssues] of Object.entries(issuesByFile)) {
        const relativePath = path.relative(directory, file)
        console.log(`\\n  📄 ${relativePath}:`)
        
        fileIssues
          .sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
            return severityOrder[a.severity] - severityOrder[b.severity]
          })
          .forEach(issue => {
            const color = severityColors[issue.severity]
            const severityIcon = {
              critical: '🚨',
              high: '⚠️',
              medium: 'ℹ️',
              low: '✅'
            }[issue.severity]
            
            console.log(`    ${color}${severityIcon} Line ${issue.line}: ${issue.type}\\x1b[0m`)
            console.log(`       ${issue.description}`)
            if (issue.cwe) {
              console.log(`       CWE: ${issue.cwe}`)
            }
            if (issue.suggestion) {
              console.log(`       💡 ${issue.suggestion}`)
            }
            if (issue.code) {
              console.log(`       Code: \\x1b[90m${issue.code}\\x1b[0m`)
            }
            console.log()
          })
      }
    } else {
      console.log(`\\x1b[32m🎉 No security issues found!\\x1b[0m`)
    }
    
    console.log(`\\x1b[90mScan results saved with ID: ${result.scanId}\\x1b[0m`)
    console.log(`\\x1b[90mUse 'coda security show ${result.scanId}' to view results again\\x1b[0m`)
    
  } catch (error) {
    warn(`Failed to perform security scan: ${error.message}`)
  }
}

async function listScans(scanner: SecurityScanner, args: string[]): Promise<void> {
  try {
    const limitArg = args.find(arg => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20
    
    if (limitArg && (isNaN(limit) || limit <= 0)) {
      warn('Limit must be a positive number')
      return
    }
    
    const history = await scanner.loadScanHistory(limit)
    
    if (history.length === 0) {
      console.log('No security scans found.')
      return
    }
    
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                   Scan History                       ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[33mShowing ${history.length} most recent scans:\\x1b[0m\\n`)
    
    history.forEach((scan, index) => {
      const time = new Date(scan.timestamp).toLocaleString()
      const duration = (scan.scanDuration / 1000).toFixed(2)
      
      console.log(`${index + 1}. \\x1b[34m${scan.scanId}\\x1b[0m [${time}]`)
      console.log(`   📁 Files: ${scan.scannedFiles} | ⏱️ Duration: ${duration}s`)
      console.log(`   📊 Issues: \\x1b[31m${scan.criticalIssues}\\x1b[0m critical, \\x1b[33m${scan.highIssues}\\x1b[0m high, ${scan.totalIssues} total`)
      console.log()
    })
    
  } catch (error) {
    warn(`Failed to list scans: ${error.message}`)
  }
}

async function showScan(scanner: SecurityScanner, args: string[]): Promise<void> {
  if (args.length === 0) {
    warn('Please provide a scan ID')
    warn('Usage: coda security show <scan-id>')
    return
  }
  
  const scanId = args[0]
  
  try {
    const result = await scanner.loadScanResult(scanId)
    
    if (!result) {
      warn(`Scan result ${scanId} not found`)
      return
    }
    
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                Security Scan Details                ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[33mScan Information:\\x1b[0m`)
    console.log(`  🆔 Scan ID: ${result.scanId}`)
    console.log(`  📅 Timestamp: ${new Date(result.timestamp).toLocaleString()}`)
    console.log(`  📁 Files Scanned: ${result.scannedFiles.length}`)
    console.log(`  ⏱️ Duration: ${(result.scanDuration / 1000).toFixed(2)}s`)
    console.log()
    
    console.log(`\\x1b[33mIssue Summary:\\x1b[0m`)
    console.log(`  🚨 Critical: ${result.criticalIssues}`)
    console.log(`  ⚠️ High: ${result.highIssues}`)
    console.log(`  ℹ️ Medium: ${result.mediumIssues}`)
    console.log(`  ✅ Low: ${result.lowIssues}`)
    console.log(`  📊 Total: ${result.totalIssues}`)
    console.log()
    
    if (result.issues.length > 0) {
      console.log(`\\x1b[33mIssues:\\x1b[0m`)
      
      result.issues.forEach((issue, index) => {
        const severityColors = {
          critical: '\\x1b[31m',
          high: '\\x1b[33m',
          medium: '\\x1b[34m',
          low: '\\x1b[32m'
        }
        
        const color = severityColors[issue.severity]
        console.log(`\\n${index + 1}. ${color}${issue.severity.toUpperCase()}\\x1b[0m - ${issue.type}`)
        console.log(`   📄 File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`)
        console.log(`   📝 ${issue.description}`)
        if (issue.cwe) {
          console.log(`   🔗 CWE: ${issue.cwe}`)
        }
        if (issue.suggestion) {
          console.log(`   💡 Suggestion: ${issue.suggestion}`)
        }
        if (issue.code) {
          console.log(`   📋 Code: \\x1b[90m${issue.code}\\x1b[0m`)
        }
      })
    }
    
  } catch (error) {
    warn(`Failed to show scan details: ${error.message}`)
  }
}

async function exportScan(scanner: SecurityScanner, args: string[]): Promise<void> {
  if (args.length < 2) {
    warn('Please provide scan ID and output file path')
    warn('Usage: coda security export <scan-id> <output-file>')
    warn('Supported formats: .json, .csv, .html')
    return
  }
  
  const scanId = args[0]
  const outputPath = args[1]
  
  try {
    await scanner.exportScanResult(scanId, outputPath)
    
    log(`✅ Scan results exported to: ${outputPath}`)
    
    const ext = path.extname(outputPath).toLowerCase()
    if (ext === '.html') {
      log('💡 Open the HTML file in a web browser to view the formatted report')
    }
    
  } catch (error) {
    warn(`Failed to export scan results: ${error.message}`)
  }
}

async function deleteScan(scanner: SecurityScanner, args: string[]): Promise<void> {
  if (args.length === 0) {
    warn('Please provide a scan ID')
    warn('Usage: coda security delete <scan-id>')
    return
  }
  
  const scanId = args[0]
  
  try {
    const deleted = await scanner.deleteScanResult(scanId)
    
    if (deleted) {
      log(`✅ Scan result ${scanId} deleted successfully`)
    } else {
      warn(`Scan result ${scanId} not found`)
    }
    
  } catch (error) {
    warn(`Failed to delete scan result: ${error.message}`)
  }
}

async function showRules(): Promise<void> {
  const { SECURITY_RULES } = await import('../features/security-scanner.js')
  
  console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
  console.log(`\\x1b[36m║                   Security Rules                     ║\\x1b[0m`)
  console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
  
  const rulesBySeverity = SECURITY_RULES.reduce((acc, rule) => {
    if (!acc[rule.severity]) {
      acc[rule.severity] = []
    }
    acc[rule.severity].push(rule)
    return acc
  }, {} as Record<string, typeof SECURITY_RULES>)
  
  const severityOrder: Array<keyof typeof rulesBySeverity> = ['critical', 'high', 'medium', 'low']
  const severityColors = {
    critical: '\\x1b[31m',
    high: '\\x1b[33m',
    medium: '\\x1b[34m',
    low: '\\x1b[32m'
  }
  
  for (const severity of severityOrder) {
    const rules = rulesBySeverity[severity]
    if (!rules || rules.length === 0) continue
    
    const color = severityColors[severity]
    console.log(`${color}${severity.toUpperCase()} SEVERITY RULES:\\x1b[0m`)
    
    rules.forEach((rule, index) => {
      console.log(`\\n${index + 1}. \\x1b[33m${rule.name}\\x1b[0m (${rule.id})`)
      console.log(`   📝 ${rule.description}`)
      console.log(`   🎯 File types: ${rule.fileTypes.join(', ')}`)
      if (rule.cwe) {
        console.log(`   🔗 CWE: ${rule.cwe}`)
      }
      console.log(`   💡 ${rule.suggestion}`)
    })
    
    console.log()
  }
  
  console.log(`\\x1b[90mTotal rules: ${SECURITY_RULES.length}\\x1b[0m`)
  console.log(`\\x1b[90mFor more information about CWE codes, visit: https://cwe.mitre.org/\\x1b[0m`)
}