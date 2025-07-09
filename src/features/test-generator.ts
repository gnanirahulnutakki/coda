import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { CONFIG_PATHS } from '../config/paths.js'

export interface TestGenerationOptions {
  framework?: 'vitest' | 'jest' | 'mocha' | 'jasmine' | 'auto'
  style?: 'unit' | 'integration' | 'e2e' | 'all'
  coverage?: boolean
  mockStrategy?: 'manual' | 'auto' | 'minimal'
  assertionStyle?: 'expect' | 'assert' | 'should'
  includeEdgeCases?: boolean
  includeErrorHandling?: boolean
  generateSnapshots?: boolean
}

export interface TestFile {
  sourcePath: string
  testPath: string
  framework: string
  coverage?: CoverageInfo
  exists: boolean
  needsUpdate?: boolean
}

export interface CoverageInfo {
  statements: number
  branches: number
  functions: number
  lines: number
  uncoveredLines?: number[]
  uncoveredFunctions?: string[]
}

export interface TestGenerationResult {
  filesGenerated: number
  filesUpdated: number
  testFiles: TestFile[]
  coverage?: CoverageReport
  errors: string[]
}

export interface CoverageReport {
  total: CoverageInfo
  files: Record<string, CoverageInfo>
  timestamp: string
}

export class TestGenerator {
  private configDir: string
  private coverageDir: string
  private options: TestGenerationOptions

  constructor(options: TestGenerationOptions = {}) {
    this.options = {
      framework: 'auto',
      style: 'unit',
      coverage: true,
      mockStrategy: 'auto',
      assertionStyle: 'expect',
      includeEdgeCases: true,
      includeErrorHandling: true,
      generateSnapshots: false,
      ...options,
    }

    this.configDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'test-generation')
    this.coverageDir = path.join(this.configDir, 'coverage')

    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }
    if (!fs.existsSync(this.coverageDir)) {
      fs.mkdirSync(this.coverageDir, { recursive: true })
    }
  }

  /**
   * Detect the test framework used in the project
   */
  detectFramework(projectPath: string): string {
    const packageJsonPath = path.join(projectPath, 'package.json')

    if (!fs.existsSync(packageJsonPath)) {
      return 'vitest' // Default
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }

      // Check for test frameworks in order of preference
      if (allDeps.vitest) return 'vitest'
      if (allDeps.jest) return 'jest'
      if (allDeps.mocha) return 'mocha'
      if (allDeps.jasmine) return 'jasmine'

      // Check test script
      const testScript = packageJson.scripts?.test || ''
      if (testScript.includes('vitest')) return 'vitest'
      if (testScript.includes('jest')) return 'jest'
      if (testScript.includes('mocha')) return 'mocha'
      if (testScript.includes('jasmine')) return 'jasmine'

      return 'vitest' // Default
    } catch (error) {
      return 'vitest'
    }
  }

  /**
   * Generate test file path based on source file
   */
  getTestFilePath(sourcePath: string, projectPath: string): string {
    const relativePath = path.relative(projectPath, sourcePath)
    const parsed = path.parse(relativePath)

    // Common test directory patterns
    const testDirs = ['test', 'tests', '__tests__', 'spec']

    // Check if test directory exists
    let testDir = 'test' // Default
    for (const dir of testDirs) {
      if (fs.existsSync(path.join(projectPath, dir))) {
        testDir = dir
        break
      }
    }

    // Handle different naming conventions
    let testFileName: string
    if (testDir === '__tests__') {
      // Jest style: Keep in __tests__ next to source
      const sourceDir = path.dirname(sourcePath)
      return path.join(sourceDir, '__tests__', `${parsed.name}.test${parsed.ext}`)
    } else if (testDir === 'spec') {
      // Jasmine style
      testFileName = `${parsed.name}.spec${parsed.ext}`
    } else {
      // Vitest/Mocha style
      testFileName = `${parsed.name}.test${parsed.ext}`
    }

    return path.join(projectPath, testDir, parsed.dir, testFileName)
  }

  /**
   * Analyze a file to understand its structure
   */
  analyzeFile(filePath: string): FileAnalysis {
    const content = fs.readFileSync(filePath, 'utf8')
    const ext = path.extname(filePath)

    const analysis: FileAnalysis = {
      filePath,
      language: this.detectLanguage(ext),
      exports: [],
      imports: [],
      classes: [],
      functions: [],
      constants: [],
      hasDefaultExport: false,
      isTestFile: false,
    }

    // Basic pattern matching for TypeScript/JavaScript
    if (analysis.language === 'typescript' || analysis.language === 'javascript') {
      // Detect exports
      const exportRegex =
        /export\s+(?:(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)|{\s*([^}]+)\s*})/g
      let match
      while ((match = exportRegex.exec(content)) !== null) {
        if (match[1]) {
          analysis.exports.push(match[1])
          if (match[0].includes('default')) {
            analysis.hasDefaultExport = true
          }
        } else if (match[2]) {
          // Named exports
          analysis.exports.push(...match[2].split(',').map((e) => e.trim()))
        }
      }

      // Detect classes
      const classRegex = /(?:export\s+)?class\s+(\w+)/g
      while ((match = classRegex.exec(content)) !== null) {
        analysis.classes.push(match[1])
      }

      // Detect functions
      const functionRegex =
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\([^)]*\):\s*\w+\s*=>)/g
      while ((match = functionRegex.exec(content)) !== null) {
        analysis.functions.push(match[1] || match[2])
      }

      // Check if it's already a test file
      analysis.isTestFile =
        /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath) ||
        content.includes('describe(') ||
        content.includes('it(') ||
        content.includes('test(')
    }

    return analysis
  }

  /**
   * Generate test content for a file
   */
  generateTestContent(analysis: FileAnalysis, framework: string): string {
    const imports = this.generateImports(analysis, framework)
    const setup = this.generateSetup(analysis, framework)
    const tests = this.generateTestCases(analysis, framework)

    return `${imports}\n\n${setup}\n\n${tests}`
  }

  private generateImports(analysis: FileAnalysis, framework: string): string {
    const lines: string[] = []

    // Framework-specific imports
    switch (framework) {
      case 'vitest':
        lines.push("import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'")
        break
      case 'jest':
        lines.push(
          "import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'",
        )
        break
      case 'mocha':
        lines.push("import { describe, it, beforeEach, afterEach } from 'mocha'")
        lines.push("import { expect } from 'chai'")
        lines.push("import sinon from 'sinon'")
        break
      case 'jasmine':
        lines.push("import 'jasmine'")
        break
    }

    // Import the module being tested
    const relativePath = this.getRelativeImportPath(analysis.filePath)
    if (analysis.hasDefaultExport && analysis.exports.length === 1) {
      lines.push(`import ${analysis.exports[0]} from '${relativePath}'`)
    } else if (analysis.exports.length > 0) {
      lines.push(`import { ${analysis.exports.join(', ')} } from '${relativePath}'`)
    } else {
      lines.push(`import * as module from '${relativePath}'`)
    }

    // Add mock imports if needed
    if (this.options.mockStrategy !== 'minimal' && analysis.imports.length > 0) {
      lines.push('')
      lines.push('// Mock dependencies')
      if (framework === 'vitest') {
        analysis.imports.forEach((imp) => {
          lines.push(`vi.mock('${imp}')`)
        })
      } else if (framework === 'jest') {
        analysis.imports.forEach((imp) => {
          lines.push(`jest.mock('${imp}')`)
        })
      }
    }

    return lines.join('\n')
  }

  private generateSetup(analysis: FileAnalysis, framework: string): string {
    const lines: string[] = []

    if (analysis.classes.length > 0) {
      lines.push('// Test setup')
      lines.push('let instance: any')
      lines.push('')
      lines.push('beforeEach(() => {')
      lines.push('  // Initialize test instance')
      lines.push(`  instance = new ${analysis.classes[0]}()`)
      lines.push('})')
      lines.push('')
      lines.push('afterEach(() => {')
      lines.push('  // Cleanup')
      if (framework === 'vitest') {
        lines.push('  vi.clearAllMocks()')
      } else if (framework === 'jest') {
        lines.push('  jest.clearAllMocks()')
      }
      lines.push('})')
    }

    return lines.join('\n')
  }

  private generateTestCases(analysis: FileAnalysis, framework: string): string {
    const lines: string[] = []

    // Generate describe blocks for each exported item
    const allItems = analysis.classes.concat(analysis.functions)
    allItems.forEach((item) => {
      lines.push(`describe('${item}', () => {`)

      if (analysis.classes.includes(item)) {
        lines.push(this.generateClassTests(item, framework))
      } else {
        lines.push(this.generateFunctionTests(item, framework))
      }

      lines.push('})')
      lines.push('')
    })

    return lines.join('\n')
  }

  private generateClassTests(className: string, framework: string): string {
    const lines: string[] = []

    lines.push(`  it('should create an instance of ${className}', () => {`)
    lines.push(`    expect(instance).toBeInstanceOf(${className})`)
    lines.push('  })')
    lines.push('')

    if (this.options.includeEdgeCases) {
      lines.push('  // Edge cases')
      lines.push(`  it('should handle null/undefined inputs gracefully', () => {`)
      lines.push('    // TODO: Add edge case tests')
      lines.push('  })')
      lines.push('')
    }

    if (this.options.includeErrorHandling) {
      lines.push('  // Error handling')
      lines.push(`  it('should throw error for invalid inputs', () => {`)
      lines.push('    // TODO: Add error handling tests')
      lines.push('  })')
    }

    return lines.join('\n')
  }

  private generateFunctionTests(functionName: string, framework: string): string {
    const lines: string[] = []

    lines.push(`  it('should execute ${functionName} successfully', () => {`)
    lines.push(`    // TODO: Add test implementation`)
    lines.push(`    const result = ${functionName}()`)
    lines.push('    expect(result).toBeDefined()')
    lines.push('  })')
    lines.push('')

    if (this.options.includeEdgeCases) {
      lines.push(`  it('should handle edge cases in ${functionName}', () => {`)
      lines.push('    // TODO: Add edge case tests')
      lines.push('  })')
      lines.push('')
    }

    if (this.options.includeErrorHandling) {
      lines.push(`  it('should handle errors in ${functionName}', () => {`)
      lines.push('    // TODO: Add error handling tests')
      lines.push('  })')
    }

    return lines.join('\n')
  }

  private getRelativeImportPath(filePath: string): string {
    // This should be calculated based on actual test file location
    // For now, return a placeholder
    return '../src/module'
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
    }

    return langMap[ext] || 'unknown'
  }

  /**
   * Generate tests for a single file
   */
  async generateTestsForFile(filePath: string, projectPath: string): Promise<TestFile> {
    const framework =
      this.options.framework === 'auto'
        ? this.detectFramework(projectPath)
        : this.options.framework!

    const testPath = this.getTestFilePath(filePath, projectPath)
    const exists = fs.existsSync(testPath)

    const testFile: TestFile = {
      sourcePath: filePath,
      testPath,
      framework,
      exists,
      needsUpdate: false,
    }

    if (!exists || this.options.style === 'all') {
      const analysis = this.analyzeFile(filePath)
      const testContent = this.generateTestContent(analysis, framework)

      // Ensure test directory exists
      const testDir = path.dirname(testPath)
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }

      fs.writeFileSync(testPath, testContent)
      testFile.needsUpdate = exists
    }

    return testFile
  }

  /**
   * Generate tests for multiple files
   */
  async generateTests(filePaths: string[], projectPath: string): Promise<TestGenerationResult> {
    const result: TestGenerationResult = {
      filesGenerated: 0,
      filesUpdated: 0,
      testFiles: [],
      errors: [],
    }

    for (const filePath of filePaths) {
      try {
        const testFile = await this.generateTestsForFile(filePath, projectPath)
        result.testFiles.push(testFile)

        if (testFile.needsUpdate) {
          result.filesUpdated++
        } else if (!testFile.exists) {
          result.filesGenerated++
        }
      } catch (error) {
        result.errors.push(`Failed to generate test for ${filePath}: ${error.message}`)
      }
    }

    if (this.options.coverage) {
      try {
        result.coverage = await this.runCoverage(projectPath)
      } catch (error) {
        result.errors.push(`Failed to run coverage: ${error.message}`)
      }
    }

    return result
  }

  /**
   * Run coverage analysis
   */
  async runCoverage(projectPath: string): Promise<CoverageReport> {
    const framework = this.detectFramework(projectPath)
    let coverageCommand: string

    switch (framework) {
      case 'vitest':
        coverageCommand = 'npx vitest run --coverage'
        break
      case 'jest':
        coverageCommand = 'npx jest --coverage'
        break
      case 'mocha':
        coverageCommand = 'npx nyc mocha'
        break
      default:
        throw new Error(`Coverage not supported for ${framework}`)
    }

    try {
      execSync(coverageCommand, {
        cwd: projectPath,
        stdio: 'pipe',
      })

      // Parse coverage report (assuming it's in coverage/coverage-summary.json)
      const coveragePath = path.join(projectPath, 'coverage', 'coverage-summary.json')
      if (fs.existsSync(coveragePath)) {
        const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))

        return {
          total: this.parseCoverageData(coverageData.total),
          files: Object.entries(coverageData)
            .filter(([key]) => key !== 'total')
            .reduce(
              (acc, [file, data]: [string, any]) => {
                acc[file] = this.parseCoverageData(data)
                return acc
              },
              {} as Record<string, CoverageInfo>,
            ),
          timestamp: new Date().toISOString(),
        }
      }
    } catch (error) {
      // Fallback: return empty coverage report
    }

    return {
      total: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
      files: {},
      timestamp: new Date().toISOString(),
    }
  }

  private parseCoverageData(data: any): CoverageInfo {
    return {
      statements: data.statements?.pct || 0,
      branches: data.branches?.pct || 0,
      functions: data.functions?.pct || 0,
      lines: data.lines?.pct || 0,
    }
  }

  /**
   * Get coverage trends over time
   */
  getCoverageTrends(projectPath: string, days: number = 30): CoverageTrend[] {
    const trendsFile = path.join(this.coverageDir, 'trends.json')

    if (!fs.existsSync(trendsFile)) {
      return []
    }

    try {
      const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'))
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      return trends.filter((t: CoverageTrend) => new Date(t.timestamp) >= cutoffDate)
    } catch (error) {
      return []
    }
  }

  /**
   * Save coverage trend data
   */
  saveCoverageTrend(projectPath: string, coverage: CoverageReport): void {
    const trendsFile = path.join(this.coverageDir, 'trends.json')
    let trends: CoverageTrend[] = []

    if (fs.existsSync(trendsFile)) {
      try {
        trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'))
      } catch (error) {
        // Ignore parse errors
      }
    }

    trends.push({
      timestamp: coverage.timestamp,
      project: path.basename(projectPath),
      coverage: coverage.total,
    })

    // Keep only last 90 days
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 90)
    trends = trends.filter((t) => new Date(t.timestamp) >= cutoffDate)

    fs.writeFileSync(trendsFile, JSON.stringify(trends, null, 2))
  }

  /**
   * Get test recommendations based on coverage
   */
  getTestRecommendations(coverage: CoverageReport): TestRecommendation[] {
    const recommendations: TestRecommendation[] = []

    // Overall coverage recommendations
    if (coverage.total.statements < 80) {
      recommendations.push({
        priority: 'high',
        type: 'coverage',
        message: `Statement coverage is ${coverage.total.statements}%. Aim for at least 80%.`,
        files: [],
      })
    }

    if (coverage.total.branches < 70) {
      recommendations.push({
        priority: 'high',
        type: 'coverage',
        message: `Branch coverage is ${coverage.total.branches}%. Consider adding tests for conditional logic.`,
        files: [],
      })
    }

    // File-specific recommendations
    const lowCoverageFiles = Object.entries(coverage.files)
      .filter(([_, data]) => data.lines < 50)
      .map(([file]) => file)

    if (lowCoverageFiles.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'coverage',
        message: `${lowCoverageFiles.length} files have less than 50% coverage`,
        files: lowCoverageFiles,
      })
    }

    return recommendations
  }
}

interface FileAnalysis {
  filePath: string
  language: string
  exports: string[]
  imports: string[]
  classes: string[]
  functions: string[]
  constants: string[]
  hasDefaultExport: boolean
  isTestFile: boolean
}

interface CoverageTrend {
  timestamp: string
  project: string
  coverage: CoverageInfo
}

interface TestRecommendation {
  priority: 'high' | 'medium' | 'low'
  type: 'coverage' | 'missing' | 'outdated'
  message: string
  files: string[]
}
