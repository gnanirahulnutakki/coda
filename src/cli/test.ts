import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { TestGenerator } from '../features/test-generator.js'

function printHelp(): void {
  console.log(`
Test Generation & Coverage Tracking

Usage: coda test <command> [options]

Commands:
  generate <files...>          Generate test files for specified source files
  coverage                     Run tests and display coverage report
  trends [days]                Show coverage trends over time
  recommend                    Get test recommendations based on coverage
  watch <files...>             Watch files and regenerate tests on changes

Options:
  --framework <name>           Test framework (vitest, jest, mocha, jasmine, auto)
  --style <type>               Test style (unit, integration, e2e, all)
  --no-coverage                Skip coverage analysis
  --mock-strategy <strategy>   Mock strategy (manual, auto, minimal)
  --assertion <style>          Assertion style (expect, assert, should)
  --edge-cases                 Include edge case tests
  --error-handling             Include error handling tests
  --snapshots                  Generate snapshot tests
  --pattern <glob>             File pattern for batch generation
  --update                     Update existing test files

Examples:
  coda test generate src/utils.ts src/helpers.ts
  coda test generate --pattern "src/**/*.ts" --framework jest
  coda test coverage
  coda test trends 30
  coda test recommend
  coda test watch src/**/*.ts --framework vitest
`)
}

function parseOptions(args: string[]): {
  options: any
  files: string[]
} {
  const options: any = {
    framework: 'auto',
    style: 'unit',
    coverage: true,
    mockStrategy: 'auto',
    assertionStyle: 'expect',
    includeEdgeCases: true,
    includeErrorHandling: true,
    generateSnapshots: false
  }
  
  const files: string[] = []
  let i = 0
  
  while (i < args.length) {
    const arg = args[i]
    
    switch (arg) {
      case '--framework':
        options.framework = args[++i]
        break
      case '--style':
        options.style = args[++i]
        break
      case '--no-coverage':
        options.coverage = false
        break
      case '--mock-strategy':
        options.mockStrategy = args[++i]
        break
      case '--assertion':
        options.assertionStyle = args[++i]
        break
      case '--edge-cases':
        options.includeEdgeCases = true
        break
      case '--error-handling':
        options.includeErrorHandling = true
        break
      case '--snapshots':
        options.generateSnapshots = true
        break
      case '--pattern':
        i++
        // Handle pattern later
        break
      case '--update':
        options.style = 'all' // Force update mode
        break
      default:
        if (!arg.startsWith('--')) {
          files.push(arg)
        }
    }
    i++
  }
  
  return { options, files }
}

async function resolveFiles(patterns: string[], cwd: string): Promise<string[]> {
  const files = new Set<string>()
  
  for (const pattern of patterns) {
    if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
      // Direct file path
      files.add(path.resolve(pattern))
    } else {
      // Glob pattern
      const matches = await glob(pattern, { cwd, absolute: true })
      matches.forEach(file => files.add(file))
    }
  }
  
  // Filter out test files and non-source files
  return Array.from(files).filter(file => {
    const ext = path.extname(file)
    const isSourceFile = ['.ts', '.tsx', '.js', '.jsx'].includes(ext)
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file)
    return isSourceFile && !isTestFile
  })
}

export async function handleTestCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const projectPath = process.cwd()

  try {
    switch (command) {
      case 'generate': {
        const { options, files } = parseOptions(args.slice(1))
        
        if (files.length === 0) {
          // Check for pattern option
          const patternIndex = args.indexOf('--pattern')
          if (patternIndex !== -1 && args[patternIndex + 1]) {
            const pattern = args[patternIndex + 1]
            const resolvedFiles = await resolveFiles([pattern], projectPath)
            
            if (resolvedFiles.length === 0) {
              console.error('Error: No source files found matching pattern')
              process.exit(1)
            }
            
            files.push(...resolvedFiles)
          } else {
            console.error('Error: No files specified')
            console.log('Usage: coda test generate <files...> or --pattern <glob>')
            process.exit(1)
          }
        }
        
        const generator = new TestGenerator(options)
        
        console.log(`Generating tests for ${files.length} file(s)...`)
        console.log(`Framework: ${options.framework === 'auto' ? 'auto-detect' : options.framework}`)
        console.log(`Style: ${options.style}`)
        console.log()
        
        const resolvedFiles = await resolveFiles(files, projectPath)
        const result = await generator.generateTests(resolvedFiles, projectPath)
        
        console.log('Test Generation Results:')
        console.log(`  Files generated: ${result.filesGenerated}`)
        console.log(`  Files updated: ${result.filesUpdated}`)
        
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`)
          result.errors.forEach(err => console.error(`    - ${err}`))
        }
        
        if (result.testFiles.length > 0) {
          console.log('\nGenerated test files:')
          result.testFiles.forEach(testFile => {
            const status = testFile.needsUpdate ? 'updated' : 'created'
            console.log(`  ${status}: ${path.relative(projectPath, testFile.testPath)}`)
          })
        }
        
        if (result.coverage && options.coverage) {
          console.log('\nCoverage Report:')
          console.log(`  Statements: ${result.coverage.total.statements}%`)
          console.log(`  Branches: ${result.coverage.total.branches}%`)
          console.log(`  Functions: ${result.coverage.total.functions}%`)
          console.log(`  Lines: ${result.coverage.total.lines}%`)
          
          // Save coverage trend
          generator.saveCoverageTrend(projectPath, result.coverage)
        }
        
        break
      }

      case 'coverage': {
        const generator = new TestGenerator()
        
        console.log('Running test coverage analysis...\n')
        
        try {
          const coverage = await generator.runCoverage(projectPath)
          
          console.log('Overall Coverage:')
          console.log(`  Statements: ${coverage.total.statements}%`)
          console.log(`  Branches: ${coverage.total.branches}%`)
          console.log(`  Functions: ${coverage.total.functions}%`)
          console.log(`  Lines: ${coverage.total.lines}%`)
          
          const fileEntries = Object.entries(coverage.files)
          if (fileEntries.length > 0) {
            console.log('\nFile Coverage:')
            
            // Sort by coverage percentage
            fileEntries
              .sort(([, a], [, b]) => a.lines - b.lines)
              .forEach(([file, data]) => {
                const relPath = path.relative(projectPath, file)
                console.log(`  ${relPath}:`)
                console.log(`    Lines: ${data.lines}% | Functions: ${data.functions}% | Branches: ${data.branches}%`)
              })
          }
          
          // Save trend
          generator.saveCoverageTrend(projectPath, coverage)
          
          // Show recommendations
          const recommendations = generator.getTestRecommendations(coverage)
          if (recommendations.length > 0) {
            console.log('\nRecommendations:')
            recommendations.forEach(rec => {
              const icon = rec.priority === 'high' ? '⚠️ ' : '💡'
              console.log(`  ${icon} ${rec.message}`)
              if (rec.files.length > 0) {
                rec.files.slice(0, 5).forEach(file => {
                  console.log(`     - ${path.relative(projectPath, file)}`)
                })
                if (rec.files.length > 5) {
                  console.log(`     ... and ${rec.files.length - 5} more`)
                }
              }
            })
          }
        } catch (error) {
          console.error('Error running coverage:', error.message)
          console.log('\nMake sure you have a test framework installed and configured.')
          process.exit(1)
        }
        
        break
      }

      case 'trends': {
        const days = parseInt(args[1]) || 30
        const generator = new TestGenerator()
        
        const trends = generator.getCoverageTrends(projectPath, days)
        
        if (trends.length === 0) {
          console.log('No coverage trend data available.')
          console.log('Run "coda test coverage" to start tracking coverage.')
          return
        }
        
        console.log(`Coverage Trends (last ${days} days):\n`)
        
        // Group by project
        const projectTrends = new Map<string, any[]>()
        trends.forEach(trend => {
          if (!projectTrends.has(trend.project)) {
            projectTrends.set(trend.project, [])
          }
          projectTrends.get(trend.project)!.push(trend)
        })
        
        projectTrends.forEach((projTrends, project) => {
          console.log(`Project: ${project}`)
          console.log('Date                  Lines    Functions  Branches  Statements')
          console.log('─'.repeat(65))
          
          projTrends
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 10)
            .forEach(trend => {
              const date = new Date(trend.timestamp).toLocaleDateString()
              const time = new Date(trend.timestamp).toLocaleTimeString()
              console.log(
                `${date} ${time}  ${trend.coverage.lines.toString().padStart(4)}%    ` +
                `${trend.coverage.functions.toString().padStart(4)}%      ` +
                `${trend.coverage.branches.toString().padStart(4)}%     ` +
                `${trend.coverage.statements.toString().padStart(4)}%`
              )
            })
          
          // Show trend direction
          if (projTrends.length >= 2) {
            const latest = projTrends[0].coverage
            const previous = projTrends[projTrends.length - 1].coverage
            const linesDiff = latest.lines - previous.lines
            const trend = linesDiff > 0 ? '📈' : linesDiff < 0 ? '📉' : '➡️'
            
            console.log(`\nTrend: ${trend} ${linesDiff > 0 ? '+' : ''}${linesDiff.toFixed(1)}% lines coverage`)
          }
          
          console.log()
        })
        
        break
      }

      case 'recommend': {
        const generator = new TestGenerator()
        
        console.log('Analyzing project for test recommendations...\n')
        
        try {
          // Run coverage first
          const coverage = await generator.runCoverage(projectPath)
          const recommendations = generator.getTestRecommendations(coverage)
          
          if (recommendations.length === 0) {
            console.log('✅ Great job! Your test coverage looks good.')
            console.log('\nCurrent coverage:')
            console.log(`  Lines: ${coverage.total.lines}%`)
            console.log(`  Functions: ${coverage.total.functions}%`)
            console.log(`  Branches: ${coverage.total.branches}%`)
            return
          }
          
          console.log('Test Recommendations:\n')
          
          // Group by priority
          const highPriority = recommendations.filter(r => r.priority === 'high')
          const mediumPriority = recommendations.filter(r => r.priority === 'medium')
          const lowPriority = recommendations.filter(r => r.priority === 'low')
          
          if (highPriority.length > 0) {
            console.log('🔴 High Priority:')
            highPriority.forEach(rec => {
              console.log(`   ${rec.message}`)
              rec.files.slice(0, 3).forEach(file => {
                console.log(`     - ${path.relative(projectPath, file)}`)
              })
            })
            console.log()
          }
          
          if (mediumPriority.length > 0) {
            console.log('🟡 Medium Priority:')
            mediumPriority.forEach(rec => {
              console.log(`   ${rec.message}`)
              rec.files.slice(0, 3).forEach(file => {
                console.log(`     - ${path.relative(projectPath, file)}`)
              })
            })
            console.log()
          }
          
          if (lowPriority.length > 0) {
            console.log('🟢 Low Priority:')
            lowPriority.forEach(rec => {
              console.log(`   ${rec.message}`)
            })
          }
          
          console.log('\nRun "coda test generate --pattern <glob>" to generate missing tests.')
        } catch (error) {
          console.error('Error analyzing project:', error.message)
          process.exit(1)
        }
        
        break
      }

      case 'watch': {
        console.log('Watch mode is not yet implemented.')
        console.log('This feature will allow watching files and regenerating tests on changes.')
        break
      }

      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}