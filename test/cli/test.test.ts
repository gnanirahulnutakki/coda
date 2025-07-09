import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { execSync } from 'child_process'
import { handleTestCommand } from '../../src/cli/test.js'
import { TestGenerator } from '../../src/features/test-generator.js'

vi.mock('fs')
vi.mock('glob')
vi.mock('child_process')
vi.mock('../../src/features/test-generator.js')

describe('test CLI', () => {
  let mockGenerator: any
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let processExitSpy: any
  let processCwdSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    processCwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/test/project')
    
    // Mock TestGenerator
    mockGenerator = {
      detectFramework: vi.fn().mockReturnValue('vitest'),
      getTestFilePath: vi.fn().mockReturnValue('/test/project/test/file.test.ts'),
      analyzeFile: vi.fn(),
      generateTestContent: vi.fn(),
      generateTestsForFile: vi.fn(),
      generateTests: vi.fn().mockResolvedValue({
        filesGenerated: 2,
        filesUpdated: 1,
        testFiles: [
          {
            sourcePath: '/test/project/src/utils.ts',
            testPath: '/test/project/test/utils.test.ts',
            framework: 'vitest',
            exists: false
          }
        ],
        errors: []
      }),
      runCoverage: vi.fn().mockResolvedValue({
        total: {
          statements: 85,
          branches: 75,
          functions: 90,
          lines: 85
        },
        files: {},
        timestamp: new Date().toISOString()
      }),
      getCoverageTrends: vi.fn().mockReturnValue([]),
      saveCoverageTrend: vi.fn(),
      getTestRecommendations: vi.fn().mockReturnValue([])
    }
    
    vi.mocked(TestGenerator).mockImplementation(() => mockGenerator)
    
    // Mock fs
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any)
    
    // Mock glob
    vi.mocked(glob).mockResolvedValue([])
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
    processCwdSpy.mockRestore()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handleTestCommand([])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Generation & Coverage Tracking'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'))
    })

    it('should display help for help command', async () => {
      await handleTestCommand(['help'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Generation & Coverage Tracking'))
    })
  })

  describe('generate command', () => {
    it('should generate tests for specified files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any)
      
      await handleTestCommand(['generate', 'src/utils.ts', 'src/helpers.ts'])
      
      expect(TestGenerator).toHaveBeenCalled()
      expect(mockGenerator.generateTests).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('Generating tests for 2 file(s)...')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Files generated: 2')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Files updated: 1')
    })

    it('should handle glob patterns', async () => {
      vi.mocked(glob).mockResolvedValue([
        '/test/project/src/utils.ts',
        '/test/project/src/helpers.ts'
      ])
      
      await handleTestCommand(['generate', '--pattern', 'src/**/*.ts'])
      
      expect(glob).toHaveBeenCalledWith('src/**/*.ts', expect.objectContaining({
        cwd: '/test/project',
        absolute: true
      }))
      expect(mockGenerator.generateTests).toHaveBeenCalled()
    })

    it('should filter out test files', async () => {
      vi.mocked(glob).mockResolvedValue([
        '/test/project/src/utils.ts',
        '/test/project/src/utils.test.ts',
        '/test/project/src/helpers.spec.js'
      ])
      
      await handleTestCommand(['generate', '--pattern', 'src/**/*.*'])
      
      const generatedFiles = mockGenerator.generateTests.mock.calls[0][0]
      expect(generatedFiles).toHaveLength(1)
      expect(generatedFiles[0]).toBe('/test/project/src/utils.ts')
    })

    it('should require files or pattern', async () => {
      await expect(handleTestCommand(['generate'])).rejects.toThrow('process.exit')
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: No files specified')
    })

    it('should handle custom framework', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      await handleTestCommand(['generate', 'src/utils.ts', '--framework', 'jest'])
      
      expect(TestGenerator).toHaveBeenCalledWith(expect.objectContaining({
        framework: 'jest'
      }))
    })

    it('should handle test style options', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      await handleTestCommand(['generate', 'src/utils.ts', '--style', 'integration'])
      
      expect(TestGenerator).toHaveBeenCalledWith(expect.objectContaining({
        style: 'integration'
      }))
    })

    it('should handle update mode', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      await handleTestCommand(['generate', 'src/utils.ts', '--update'])
      
      expect(TestGenerator).toHaveBeenCalledWith(expect.objectContaining({
        style: 'all'
      }))
    })

    it('should display coverage when enabled', async () => {
      mockGenerator.generateTests.mockResolvedValue({
        filesGenerated: 1,
        filesUpdated: 0,
        testFiles: [],
        errors: [],
        coverage: {
          total: {
            statements: 90,
            branches: 85,
            functions: 95,
            lines: 90
          },
          files: {},
          timestamp: new Date().toISOString()
        }
      })
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      await handleTestCommand(['generate', 'src/utils.ts'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Coverage Report:'))
      expect(consoleLogSpy).toHaveBeenCalledWith('  Statements: 90%')
      expect(mockGenerator.saveCoverageTrend).toHaveBeenCalled()
    })

    it('should handle errors', async () => {
      mockGenerator.generateTests.mockResolvedValue({
        filesGenerated: 0,
        filesUpdated: 0,
        testFiles: [],
        errors: ['Failed to parse file', 'Invalid syntax']
      })
      
      vi.mocked(fs.existsSync).mockReturnValue(true)
      
      await handleTestCommand(['generate', 'src/broken.ts'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith('  Errors: 2')
      expect(consoleErrorSpy).toHaveBeenCalledWith('    - Failed to parse file')
      expect(consoleErrorSpy).toHaveBeenCalledWith('    - Invalid syntax')
    })
  })

  describe('coverage command', () => {
    it('should run coverage analysis', async () => {
      await handleTestCommand(['coverage'])
      
      expect(mockGenerator.runCoverage).toHaveBeenCalledWith('/test/project')
      expect(consoleLogSpy).toHaveBeenCalledWith('Running test coverage analysis...\n')
      expect(consoleLogSpy).toHaveBeenCalledWith('Overall Coverage:')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Statements: 85%')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Lines: 85%')
    })

    it('should display file coverage', async () => {
      mockGenerator.runCoverage.mockResolvedValue({
        total: {
          statements: 85,
          branches: 75,
          functions: 90,
          lines: 85
        },
        files: {
          '/test/project/src/utils.ts': {
            statements: 100,
            branches: 100,
            functions: 100,
            lines: 100
          },
          '/test/project/src/helpers.ts': {
            statements: 60,
            branches: 50,
            functions: 70,
            lines: 60
          }
        },
        timestamp: new Date().toISOString()
      })
      
      await handleTestCommand(['coverage'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('File Coverage:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/helpers.ts'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Lines: 60%'))
    })

    it('should show recommendations', async () => {
      mockGenerator.getTestRecommendations.mockReturnValue([
        {
          priority: 'high',
          type: 'coverage',
          message: 'Statement coverage is low',
          files: []
        }
      ])
      
      await handleTestCommand(['coverage'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Recommendations:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Statement coverage is low'))
    })

    it('should save coverage trend', async () => {
      await handleTestCommand(['coverage'])
      
      expect(mockGenerator.saveCoverageTrend).toHaveBeenCalledWith(
        '/test/project',
        expect.objectContaining({
          total: expect.any(Object)
        })
      )
    })

    it('should handle coverage errors', async () => {
      mockGenerator.runCoverage.mockRejectedValue(new Error('Coverage failed'))
      
      await expect(handleTestCommand(['coverage'])).rejects.toThrow('process.exit')
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error running coverage:', 'Coverage failed')
    })
  })

  describe('trends command', () => {
    it('should show coverage trends', async () => {
      const trends = [
        {
          timestamp: new Date().toISOString(),
          project: 'test-project',
          coverage: {
            statements: 85,
            branches: 80,
            functions: 90,
            lines: 85
          }
        },
        {
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          project: 'test-project',
          coverage: {
            statements: 80,
            branches: 75,
            functions: 85,
            lines: 80
          }
        }
      ]
      
      mockGenerator.getCoverageTrends.mockReturnValue(trends)
      
      await handleTestCommand(['trends'])
      
      expect(mockGenerator.getCoverageTrends).toHaveBeenCalledWith('/test/project', 30)
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Coverage Trends (last 30 days)'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Project: test-project'))
    })

    it('should show trend direction', async () => {
      const trends = [
        {
          timestamp: new Date().toISOString(),
          project: 'test-project',
          coverage: { statements: 85, branches: 80, functions: 90, lines: 85 }
        },
        {
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          project: 'test-project',
          coverage: { statements: 80, branches: 75, functions: 85, lines: 80 }
        }
      ]
      
      mockGenerator.getCoverageTrends.mockReturnValue(trends)
      
      await handleTestCommand(['trends'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Trend: 📈 +5.0% lines coverage'))
    })

    it('should handle custom days parameter', async () => {
      await handleTestCommand(['trends', '60'])
      
      expect(mockGenerator.getCoverageTrends).toHaveBeenCalledWith('/test/project', 60)
    })

    it('should handle no trend data', async () => {
      mockGenerator.getCoverageTrends.mockReturnValue([])
      
      await handleTestCommand(['trends'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith('No coverage trend data available.')
      expect(consoleLogSpy).toHaveBeenCalledWith('Run "coda test coverage" to start tracking coverage.')
    })
  })

  describe('recommend command', () => {
    it('should show test recommendations', async () => {
      mockGenerator.getTestRecommendations.mockReturnValue([
        {
          priority: 'high',
          type: 'coverage',
          message: 'Statement coverage is 70%. Aim for at least 80%.',
          files: ['/test/project/src/utils.ts']
        },
        {
          priority: 'medium',
          type: 'coverage',
          message: '3 files have less than 50% coverage',
          files: ['/test/project/src/helpers.ts', '/test/project/src/api.ts']
        }
      ])
      
      await handleTestCommand(['recommend'])
      
      expect(mockGenerator.runCoverage).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('Test Recommendations:\n')
      expect(consoleLogSpy).toHaveBeenCalledWith('🔴 High Priority:')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Statement coverage is 70%'))
    })

    it('should show no recommendations for good coverage', async () => {
      mockGenerator.getTestRecommendations.mockReturnValue([])
      mockGenerator.runCoverage.mockResolvedValue({
        total: {
          statements: 95,
          branches: 90,
          functions: 98,
          lines: 95
        },
        files: {},
        timestamp: new Date().toISOString()
      })
      
      await handleTestCommand(['recommend'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Great job! Your test coverage looks good.')
      expect(consoleLogSpy).toHaveBeenCalledWith('  Lines: 95%')
    })

    it('should handle errors', async () => {
      mockGenerator.runCoverage.mockRejectedValue(new Error('Analysis failed'))
      
      await expect(handleTestCommand(['recommend'])).rejects.toThrow('process.exit')
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error analyzing project:', 'Analysis failed')
    })
  })

  describe('watch command', () => {
    it('should show not implemented message', async () => {
      await handleTestCommand(['watch', 'src/**/*.ts'])
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Watch mode is not yet implemented.')
    })
  })

  describe('unknown command', () => {
    it('should show error for unknown command', async () => {
      await expect(handleTestCommand(['unknown'])).rejects.toThrow('process.exit')
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown command: unknown')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test Generation & Coverage Tracking'))
    })
  })
})