import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { TestGenerator } from '../../src/features/test-generator.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('child_process')
vi.mock('../../src/config/paths.js')

describe('TestGenerator', () => {
  let generator: TestGenerator
  const mockConfigDir = '/test/.coda'
  const mockTestGenDir = '/test/.coda/test-generation'
  const mockCoverageDir = '/test/.coda/test-generation/coverage'

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)
    
    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    
    generator = new TestGenerator()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('initialization', () => {
    it('should create directories if they do not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockTestGenDir, { recursive: true })
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockCoverageDir, { recursive: true })
    })

    it('should use default options', () => {
      const defaultGen = new TestGenerator()
      expect(defaultGen).toBeDefined()
    })

    it('should accept custom options', () => {
      const customGen = new TestGenerator({
        framework: 'jest',
        style: 'integration',
        coverage: false
      })
      expect(customGen).toBeDefined()
    })
  })

  describe('detectFramework', () => {
    it('should detect vitest', () => {
      const packageJson = {
        devDependencies: {
          vitest: '^1.0.0'
        }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(packageJson))
      
      const framework = generator.detectFramework('/project')
      expect(framework).toBe('vitest')
    })

    it('should detect jest', () => {
      const packageJson = {
        devDependencies: {
          jest: '^29.0.0'
        }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(packageJson))
      
      const framework = generator.detectFramework('/project')
      expect(framework).toBe('jest')
    })

    it('should detect from test script', () => {
      const packageJson = {
        scripts: {
          test: 'mocha test/**/*.test.js'
        }
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(packageJson))
      
      const framework = generator.detectFramework('/project')
      expect(framework).toBe('mocha')
    })

    it('should return vitest as default', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const framework = generator.detectFramework('/project')
      expect(framework).toBe('vitest')
    })
  })

  describe('getTestFilePath', () => {
    it('should generate test file path for source file', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('/project/test')
      })
      
      const testPath = generator.getTestFilePath('/project/src/utils.ts', '/project')
      expect(testPath).toBe('/project/test/src/utils.test.ts')
    })

    it('should handle __tests__ directory for jest', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('__tests__')
      })
      
      const testPath = generator.getTestFilePath('/project/src/utils.ts', '/project')
      expect(testPath).toBe('/project/src/__tests__/utils.test.ts')
    })

    it('should handle spec directory for jasmine', () => {
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path.toString().includes('/spec')
      })
      
      const testPath = generator.getTestFilePath('/project/src/utils.ts', '/project')
      expect(testPath).toBe('/project/spec/src/utils.spec.ts')
    })
  })

  describe('analyzeFile', () => {
    it('should analyze TypeScript file', () => {
      const fileContent = `
        export class Calculator {
          add(a: number, b: number): number {
            return a + b
          }
        }
        
        export function multiply(a: number, b: number): number {
          return a * b
        }
        
        export const PI = 3.14159
      `
      
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent)
      
      const analysis = generator.analyzeFile('/project/src/calculator.ts')
      
      expect(analysis.language).toBe('typescript')
      expect(analysis.classes).toContain('Calculator')
      expect(analysis.functions).toContain('multiply')
      expect(analysis.exports).toContain('Calculator')
      expect(analysis.exports).toContain('multiply')
      expect(analysis.isTestFile).toBe(false)
    })

    it('should detect test files', () => {
      const fileContent = `
        describe('Calculator', () => {
          it('should add numbers', () => {
            expect(1 + 1).toBe(2)
          })
        })
      `
      
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent)
      
      const analysis = generator.analyzeFile('/project/src/calculator.test.ts')
      expect(analysis.isTestFile).toBe(true)
    })

    it('should detect default exports', () => {
      const fileContent = `
        export default class App {
          render() {}
        }
      `
      
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent)
      
      const analysis = generator.analyzeFile('/project/src/app.ts')
      expect(analysis.hasDefaultExport).toBe(true)
      expect(analysis.exports).toContain('App')
    })

    it('should detect async functions', () => {
      const fileContent = `
        export async function fetchData() {
          return []
        }
        
        export const getData = async () => {
          return {}
        }
      `
      
      vi.mocked(fs.readFileSync).mockReturnValue(fileContent)
      
      const analysis = generator.analyzeFile('/project/src/api.ts')
      expect(analysis.functions).toContain('fetchData')
      expect(analysis.functions).toContain('getData')
    })
  })

  describe('generateTestContent', () => {
    it('should generate vitest test content', () => {
      const analysis = {
        filePath: '/project/src/calculator.ts',
        language: 'typescript',
        exports: ['Calculator', 'add'],
        imports: [],
        classes: ['Calculator'],
        functions: ['add'],
        constants: [],
        hasDefaultExport: false,
        isTestFile: false
      }
      
      const content = generator.generateTestContent(analysis, 'vitest')
      
      expect(content).toContain("import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'")
      expect(content).toContain("import { Calculator, add } from")
      expect(content).toContain("describe('Calculator', () => {")
      expect(content).toContain("describe('add', () => {")
    })

    it('should generate jest test content', () => {
      const analysis = {
        filePath: '/project/src/utils.ts',
        language: 'typescript',
        exports: ['formatDate'],
        imports: [],
        classes: [],
        functions: ['formatDate'],
        constants: [],
        hasDefaultExport: false,
        isTestFile: false
      }
      
      const jestGenerator = new TestGenerator({ framework: 'jest' })
      const content = jestGenerator.generateTestContent(analysis, 'jest')
      
      expect(content).toContain("import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'")
      expect(content).toContain("describe('formatDate', () => {")
    })

    it('should handle default exports', () => {
      const analysis = {
        filePath: '/project/src/app.ts',
        language: 'typescript',
        exports: ['App'],
        imports: [],
        classes: ['App'],
        functions: [],
        constants: [],
        hasDefaultExport: true,
        isTestFile: false
      }
      
      const content = generator.generateTestContent(analysis, 'vitest')
      
      expect(content).toContain("import App from")
    })

    it('should include edge case tests when enabled', () => {
      const analysis = {
        filePath: '/project/src/validator.ts',
        language: 'typescript',
        exports: ['validate'],
        imports: [],
        classes: [],
        functions: ['validate'],
        constants: [],
        hasDefaultExport: false,
        isTestFile: false
      }
      
      const content = generator.generateTestContent(analysis, 'vitest')
      
      expect(content).toContain('should handle edge cases')
      expect(content).toContain('// TODO: Add edge case tests')
    })

    it('should include error handling tests when enabled', () => {
      const analysis = {
        filePath: '/project/src/parser.ts',
        language: 'typescript',
        exports: ['parse'],
        imports: [],
        classes: [],
        functions: ['parse'],
        constants: [],
        hasDefaultExport: false,
        isTestFile: false
      }
      
      const content = generator.generateTestContent(analysis, 'vitest')
      
      expect(content).toContain('should handle errors')
      expect(content).toContain('// TODO: Add error handling tests')
    })
  })

  describe('generateTestsForFile', () => {
    it('should generate test file for source file', async () => {
      const mockAnalysis = {
        filePath: '/project/src/utils.ts',
        language: 'typescript',
        exports: ['helper'],
        imports: [],
        classes: [],
        functions: ['helper'],
        constants: [],
        hasDefaultExport: false,
        isTestFile: false
      }
      
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === '/project/package.json') return true
        if (path === '/project/test') return true
        if (path === '/project/test/src/utils.test.ts') return false
        return false
      })
      
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/project/package.json') {
          return JSON.stringify({ devDependencies: { vitest: '1.0.0' } })
        }
        return 'export function helper() {}'
      })
      
      const result = await generator.generateTestsForFile('/project/src/utils.ts', '/project')
      
      expect(result.sourcePath).toBe('/project/src/utils.ts')
      expect(result.testPath).toBe('/project/test/src/utils.test.ts')
      expect(result.framework).toBe('vitest')
      expect(result.exists).toBe(false)
      expect(fs.writeFileSync).toHaveBeenCalled()
    })

    it('should not overwrite existing test file by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      const result = await generator.generateTestsForFile('/project/src/utils.ts', '/project')
      
      expect(result.exists).toBe(true)
      expect(result.needsUpdate).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should update existing test file when style is all', async () => {
      const allStyleGenerator = new TestGenerator({ style: 'all' })
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('export function test() {}')
      
      const result = await allStyleGenerator.generateTestsForFile('/project/src/utils.ts', '/project')
      
      expect(result.exists).toBe(true)
      expect(result.needsUpdate).toBe(true)
      expect(fs.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('generateTests', () => {
    it('should generate tests for multiple files', async () => {
      const files = [
        '/project/src/utils.ts',
        '/project/src/helpers.ts'
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('package.json')) {
          return JSON.stringify({ devDependencies: { vitest: '1.0.0' } })
        }
        return 'export function test() {}'
      })
      
      const result = await generator.generateTests(files, '/project')
      
      expect(result.filesGenerated).toBe(2)
      expect(result.filesUpdated).toBe(0)
      expect(result.testFiles).toHaveLength(2)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle errors gracefully', async () => {
      const files = ['/project/src/broken.ts']
      
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found')
      })
      
      const result = await generator.generateTests(files, '/project')
      
      expect(result.filesGenerated).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Failed to generate test')
    })

    it('should run coverage when enabled', async () => {
      const files = ['/project/src/utils.ts']
      
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // Return true for coverage file path
        if (path.toString().includes('coverage-summary.json')) return true
        if (path.toString().includes('package.json')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('package.json')) {
          return JSON.stringify({ devDependencies: { vitest: '1.0.0' } })
        }
        if (path.toString().includes('coverage-summary.json')) {
          return JSON.stringify({
            total: {
              statements: { pct: 85 },
              branches: { pct: 75 },
              functions: { pct: 90 },
              lines: { pct: 85 }
            }
          })
        }
        return 'export function test() {}'
      })
      
      vi.mocked(execSync).mockReturnValue(Buffer.from('Coverage complete'))
      
      const result = await generator.generateTests(files, '/project')
      
      expect(result.coverage).toBeDefined()
      expect(result.coverage?.total.statements).toBe(85)
    })
  })

  describe('runCoverage', () => {
    it('should run vitest coverage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('package.json')) {
          return JSON.stringify({ devDependencies: { vitest: '1.0.0' } })
        }
        if (path.toString().includes('coverage-summary.json')) {
          return JSON.stringify({
            total: {
              statements: { pct: 90 },
              branches: { pct: 85 },
              functions: { pct: 95 },
              lines: { pct: 90 }
            },
            '/src/utils.ts': {
              statements: { pct: 100 },
              branches: { pct: 100 },
              functions: { pct: 100 },
              lines: { pct: 100 }
            }
          })
        }
        return ''
      })
      
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))
      
      const coverage = await generator.runCoverage('/project')
      
      expect(execSync).toHaveBeenCalledWith('npx vitest run --coverage', expect.any(Object))
      expect(coverage.total.statements).toBe(90)
      expect(coverage.files['/src/utils.ts']).toBeDefined()
    })

    it('should run jest coverage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path.toString().includes('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '29.0.0' } })
        }
        return '{}'
      })
      
      vi.mocked(execSync).mockReturnValue(Buffer.from(''))
      
      await generator.runCoverage('/project')
      
      expect(execSync).toHaveBeenCalledWith('npx jest --coverage', expect.any(Object))
    })

    it('should handle coverage command failure', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ devDependencies: { vitest: '1.0.0' } }))
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Coverage failed')
      })
      
      const coverage = await generator.runCoverage('/project')
      
      expect(coverage.total.statements).toBe(0)
      expect(coverage.files).toEqual({})
    })
  })

  describe('getCoverageTrends', () => {
    it('should return coverage trends', () => {
      const trends = [
        {
          timestamp: new Date().toISOString(),
          project: 'test-project',
          coverage: {
            statements: 80,
            branches: 75,
            functions: 85,
            lines: 80
          }
        },
        {
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          project: 'test-project',
          coverage: {
            statements: 78,
            branches: 73,
            functions: 83,
            lines: 78
          }
        }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(trends))
      
      const result = generator.getCoverageTrends('/project', 30)
      
      expect(result).toHaveLength(2)
      expect(result[0].coverage.statements).toBe(80)
    })

    it('should filter trends by date', () => {
      const trends = [
        {
          timestamp: new Date().toISOString(),
          project: 'test-project',
          coverage: { statements: 80, branches: 75, functions: 85, lines: 80 }
        },
        {
          timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days old
          project: 'test-project',
          coverage: { statements: 70, branches: 65, functions: 75, lines: 70 }
        }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(trends))
      
      const result = generator.getCoverageTrends('/project', 30)
      
      expect(result).toHaveLength(1)
    })

    it('should return empty array if no trends file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      const result = generator.getCoverageTrends('/project')
      
      expect(result).toEqual([])
    })
  })

  describe('saveCoverageTrend', () => {
    it('should save coverage trend', () => {
      const coverage = {
        total: {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85
        },
        files: {},
        timestamp: new Date().toISOString()
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(false)
      
      generator.saveCoverageTrend('/project', coverage)
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockCoverageDir, 'trends.json'),
        expect.any(String)
      )
    })

    it('should append to existing trends', () => {
      const existingTrends = [{
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        project: 'project',
        coverage: { statements: 80, branches: 75, functions: 85, lines: 80 }
      }]
      
      const newCoverage = {
        total: { statements: 85, branches: 80, functions: 90, lines: 85 },
        files: {},
        timestamp: new Date().toISOString()
      }
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingTrends))
      
      generator.saveCoverageTrend('/project', newCoverage)
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const savedTrends = JSON.parse(writeCall[1] as string)
      
      expect(savedTrends).toHaveLength(2)
    })

    it('should remove trends older than 90 days', () => {
      const trends = [
        {
          timestamp: new Date().toISOString(),
          project: 'project',
          coverage: { statements: 85, branches: 80, functions: 90, lines: 85 }
        },
        {
          timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days old
          project: 'project',
          coverage: { statements: 70, branches: 65, functions: 75, lines: 70 }
        }
      ]
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(trends))
      
      const newCoverage = {
        total: { statements: 90, branches: 85, functions: 95, lines: 90 },
        files: {},
        timestamp: new Date().toISOString()
      }
      
      generator.saveCoverageTrend('/project', newCoverage)
      
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const savedTrends = JSON.parse(writeCall[1] as string)
      
      expect(savedTrends).toHaveLength(2) // Old one removed, current + new
    })
  })

  describe('getTestRecommendations', () => {
    it('should recommend improving statement coverage', () => {
      const coverage = {
        total: {
          statements: 70,
          branches: 85,
          functions: 90,
          lines: 75
        },
        files: {},
        timestamp: new Date().toISOString()
      }
      
      const recommendations = generator.getTestRecommendations(coverage)
      
      expect(recommendations).toContainEqual({
        priority: 'high',
        type: 'coverage',
        message: expect.stringContaining('Statement coverage is 70%'),
        files: []
      })
    })

    it('should recommend improving branch coverage', () => {
      const coverage = {
        total: {
          statements: 85,
          branches: 60,
          functions: 90,
          lines: 85
        },
        files: {},
        timestamp: new Date().toISOString()
      }
      
      const recommendations = generator.getTestRecommendations(coverage)
      
      expect(recommendations).toContainEqual({
        priority: 'high',
        type: 'coverage',
        message: expect.stringContaining('Branch coverage is 60%'),
        files: []
      })
    })

    it('should identify low coverage files', () => {
      const coverage = {
        total: {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85
        },
        files: {
          '/src/utils.ts': {
            statements: 40,
            branches: 35,
            functions: 45,
            lines: 40
          },
          '/src/helpers.ts': {
            statements: 30,
            branches: 25,
            functions: 35,
            lines: 30
          }
        },
        timestamp: new Date().toISOString()
      }
      
      const recommendations = generator.getTestRecommendations(coverage)
      
      const lowCoverageRec = recommendations.find(r => 
        r.message.includes('files have less than 50% coverage')
      )
      
      expect(lowCoverageRec).toBeDefined()
      expect(lowCoverageRec?.files).toContain('/src/utils.ts')
      expect(lowCoverageRec?.files).toContain('/src/helpers.ts')
    })

    it('should return no recommendations for good coverage', () => {
      const coverage = {
        total: {
          statements: 90,
          branches: 85,
          functions: 95,
          lines: 90
        },
        files: {
          '/src/utils.ts': {
            statements: 95,
            branches: 90,
            functions: 100,
            lines: 95
          }
        },
        timestamp: new Date().toISOString()
      }
      
      const recommendations = generator.getTestRecommendations(coverage)
      
      expect(recommendations).toHaveLength(0)
    })
  })
})