import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { SecurityScanner, SECURITY_RULES } from '../../src/features/security-scanner.js'
import { CONFIG_PATHS } from '../../src/config/paths.js'

vi.mock('fs')
vi.mock('../../src/config/paths.js')

describe('SecurityScanner', () => {
  let securityScanner: SecurityScanner
  const mockConfigDir = '/test/.coda'
  const mockDataDir = '/test/.coda/security-scans'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock CONFIG_PATHS
    vi.mocked(CONFIG_PATHS.getConfigDirectory).mockReturnValue(mockConfigDir)

    // Mock fs methods
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
    vi.mocked(fs.readFileSync).mockReturnValue('')
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined)
    vi.mocked(fs.appendFileSync).mockReturnValue(undefined)
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined)
    vi.mocked(fs.readdirSync).mockReturnValue([])
    vi.mocked(fs.statSync).mockReturnValue({ size: 1000 } as any)

    securityScanner = new SecurityScanner()
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

      new SecurityScanner()

      expect(fs.mkdirSync).not.toHaveBeenCalled()
    })
  })

  describe('scanFile', () => {
    it('should detect SQL injection vulnerability', async () => {
      const vulnerableCode = `
        const query = "SELECT * FROM users WHERE id = " + userId
        const result = await db.query(query)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Potential SQL Injection')
      expect(issues[0].severity).toBe('critical')
      expect(issues[0].cwe).toBe('CWE-89')
    })

    it('should detect XSS vulnerability', async () => {
      const vulnerableCode = `
        element.innerHTML = \`<div>\${userInput}</div>\`
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Potential XSS Vulnerability')
      expect(issues[0].severity).toBe('high')
      expect(issues[0].cwe).toBe('CWE-79')
    })

    it('should detect hardcoded password', async () => {
      const vulnerableCode = `
        const config = {
          database: {
            password: "hardcoded123password"
          }
        }
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Hardcoded Password')
      expect(issues[0].severity).toBe('critical')
      expect(issues[0].cwe).toBe('CWE-798')
    })

    it('should detect hardcoded API key', async () => {
      const vulnerableCode = `
        const apiKey = "sk-1234567890abcdef1234567890abcdef"
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Hardcoded API Key')
      expect(issues[0].severity).toBe('critical')
      expect(issues[0].cwe).toBe('CWE-798')
    })

    it('should detect command injection', async () => {
      const vulnerableCode = `
        exec(\`ls -la \${userInput}\`)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Potential Command Injection')
      expect(issues[0].severity).toBe('critical')
      expect(issues[0].cwe).toBe('CWE-78')
    })

    it('should detect path traversal', async () => {
      const vulnerableCode = `
        fs.readFile("../../../etc/passwd", callback)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Potential Path Traversal')
      expect(issues[0].severity).toBe('high')
      expect(issues[0].cwe).toBe('CWE-22')
    })

    it('should detect weak cryptographic hash', async () => {
      const vulnerableCode = `
        const hash = md5(password)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Weak Cryptographic Hash')
      expect(issues[0].severity).toBe('medium')
      expect(issues[0].cwe).toBe('CWE-327')
    })

    it('should detect insecure random number generation', async () => {
      const vulnerableCode = `
        const token = Math.random().toString(36)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Insecure Random Number Generation')
      expect(issues[0].severity).toBe('medium')
      expect(issues[0].cwe).toBe('CWE-338')
    })

    it('should detect permissive CORS policy', async () => {
      const vulnerableCode = `
        response.setHeader('Access-Control-Allow-Origin', '*')
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Permissive CORS Policy')
      expect(issues[0].severity).toBe('high')
      expect(issues[0].cwe).toBe('CWE-942')
    })

    it('should detect dangerous eval usage', async () => {
      const vulnerableCode = `
        const result = eval(userCode)
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Dangerous Function Usage')
      expect(issues[0].severity).toBe('high')
      expect(issues[0].cwe).toBe('CWE-95')
    })

    it('should detect dangerous package import', async () => {
      const vulnerableCode = `
        const vm = require('vm2')
        import { eval } from 'eval'
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(2)
      expect(issues.every((issue) => issue.type === 'Dangerous Package Import')).toBe(true)
      expect(issues.every((issue) => issue.severity === 'high')).toBe(true)
    })

    it('should detect prototype pollution', async () => {
      const vulnerableCode = `
        Object.prototype['isAdmin'] = true
      `

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].type).toBe('Potential Prototype Pollution')
      expect(issues[0].severity).toBe('medium')
      expect(issues[0].cwe).toBe('CWE-1321')
    })

    it('should only scan files with matching extensions', async () => {
      const vulnerableCode = `eval(userInput)`

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      // Test JavaScript file - should detect issue
      const jsIssues = await securityScanner.scanFile('/test/file.js')
      expect(jsIssues).toHaveLength(1)

      // Test text file - should not detect issue
      const txtIssues = await securityScanner.scanFile('/test/file.txt')
      expect(txtIssues).toHaveLength(0)
    })

    it('should include line numbers and code snippets', async () => {
      const vulnerableCode = `
const safe = "this is safe"
const password = "hardcoded123password"
const alsoSafe = "this is also safe"
      `.trim()

      vi.mocked(fs.readFileSync).mockReturnValue(vulnerableCode)

      const issues = await securityScanner.scanFile('/test/file.js')

      expect(issues).toHaveLength(1)
      expect(issues[0].line).toBe(2)
      expect(issues[0].code).toBe('const password = "hardcoded123password"')
    })

    it('should handle file read errors', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expect(securityScanner.scanFile('/test/file.js')).rejects.toThrow('Failed to scan file')
    })
  })

  describe('scanDirectory', () => {
    it('should scan multiple files in directory', async () => {
      // Mock directory structure
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        if (dirPath === '/test/project') {
          return [
            {
              name: 'file1.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
            {
              name: 'file2.ts',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
            {
              name: 'node_modules',
              isDirectory: () => true,
              isFile: () => false,
              isSymbolicLink: () => false,
            },
          ] as any
        }
        return []
      })

      // Mock file content with vulnerabilities
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath.includes('file1.js')) {
          return 'eval(userInput)'
        }
        if (filePath.includes('file2.ts')) {
          return 'const password = "hardcoded123"'
        }
        return ''
      })

      const result = await securityScanner.scanDirectory('/test/project')

      expect(result.totalIssues).toBe(2)
      expect(result.scannedFiles).toHaveLength(2)
      expect(result.scannedFiles).toContain('/test/project/file1.js')
      expect(result.scannedFiles).toContain('/test/project/file2.ts')
    })

    it('should exclude files based on patterns', async () => {
      vi.mocked(fs.readdirSync).mockImplementation((dirPath) => {
        if (dirPath === '/test/project') {
          return [
            {
              name: 'src',
              isDirectory: () => true,
              isFile: () => false,
              isSymbolicLink: () => false,
            },
            {
              name: 'node_modules',
              isDirectory: () => true,
              isFile: () => false,
              isSymbolicLink: () => false,
            },
          ] as any
        }
        if (dirPath === '/test/project/src') {
          return [
            {
              name: 'app.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
          ] as any
        }
        if (dirPath === '/test/project/node_modules') {
          return [
            {
              name: 'package.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
          ] as any
        }
        return []
      })

      vi.mocked(fs.readFileSync).mockReturnValue('safe code')

      const result = await securityScanner.scanDirectory('/test/project')

      expect(result.scannedFiles).toHaveLength(1)
      expect(result.scannedFiles[0]).toBe('/test/project/src/app.js')
    })

    it('should respect file size limits', async () => {
      vi.mocked(fs.readdirSync).mockImplementation(
        () =>
          [
            {
              name: 'small.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
            {
              name: 'large.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
          ] as any,
      )

      vi.mocked(fs.statSync).mockImplementation((filePath) => {
        if (filePath.includes('small.js')) {
          return { size: 1000 } as any
        }
        if (filePath.includes('large.js')) {
          return { size: 20 * 1024 * 1024 } as any // 20MB
        }
        return { size: 1000 } as any
      })

      vi.mocked(fs.readFileSync).mockReturnValue('safe code')

      const result = await securityScanner.scanDirectory('/test/project', {
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
      })

      expect(result.scannedFiles).toHaveLength(1)
      expect(result.scannedFiles[0]).toContain('small.js')
    })

    it('should generate scan result with correct statistics', async () => {
      vi.mocked(fs.readdirSync).mockImplementation(
        () =>
          [
            {
              name: 'file.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
          ] as any,
      )

      vi.mocked(fs.readFileSync).mockReturnValue(`
        eval(userInput)  // high severity
        const password = "hardcoded123"  // critical severity
        Math.random()  // medium severity
      `)

      const result = await securityScanner.scanDirectory('/test/project')

      expect(result.totalIssues).toBe(3)
      expect(result.criticalIssues).toBe(1)
      expect(result.highIssues).toBe(1)
      expect(result.mediumIssues).toBe(1)
      expect(result.lowIssues).toBe(0)
      expect(result.scanId).toBeDefined()
      expect(result.timestamp).toBeDefined()
      expect(result.scanDuration).toBeGreaterThan(0)
    })

    it('should handle scanning errors gracefully', async () => {
      vi.mocked(fs.readdirSync).mockImplementation(
        () =>
          [
            {
              name: 'file.js',
              isDirectory: () => false,
              isFile: () => true,
              isSymbolicLink: () => false,
            },
          ] as any,
      )

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File read error')
      })

      // Mock console.warn to avoid test output
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await securityScanner.scanDirectory('/test/project')

      expect(result.totalIssues).toBe(0)
      expect(result.scannedFiles).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('saveScanResult', () => {
    it('should save scan result to file', async () => {
      const mockResult = {
        scanId: 'test-scan-123',
        timestamp: '2024-01-01T10:00:00Z',
        totalIssues: 1,
        criticalIssues: 1,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        issues: [],
        scannedFiles: [],
        scanDuration: 1000,
      }

      await securityScanner.saveScanResult(mockResult)

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'test-scan-123.json'),
        JSON.stringify(mockResult, null, 2),
      )

      expect(fs.appendFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'scan-history.jsonl'),
        expect.stringContaining('test-scan-123'),
      )
    })
  })

  describe('loadScanResult', () => {
    it('should load scan result from file', async () => {
      const mockResult = {
        scanId: 'test-scan-123',
        issues: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockResult))

      const result = await securityScanner.loadScanResult('test-scan-123')

      expect(result).toEqual(mockResult)
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.join(mockDataDir, 'test-scan-123.json'),
        'utf8',
      )
    })

    it('should return null if scan result does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await securityScanner.loadScanResult('nonexistent')

      expect(result).toBeNull()
    })

    it('should handle corrupted scan result file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json')

      await expect(securityScanner.loadScanResult('test-scan-123')).rejects.toThrow()
    })
  })

  describe('loadScanHistory', () => {
    it('should load scan history', async () => {
      const mockHistory = [
        { scanId: 'scan-1', timestamp: '2024-01-01T10:00:00Z' },
        { scanId: 'scan-2', timestamp: '2024-01-01T11:00:00Z' },
      ]

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        mockHistory.map((h) => JSON.stringify(h)).join('\n'),
      )

      const history = await securityScanner.loadScanHistory()

      expect(history).toHaveLength(2)
      expect(history[0].scanId).toBe('scan-2') // Most recent first
      expect(history[1].scanId).toBe('scan-1')
    })

    it('should return empty array if history file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const history = await securityScanner.loadScanHistory()

      expect(history).toEqual([])
    })

    it('should limit number of history entries', async () => {
      const mockHistory = Array.from({ length: 50 }, (_, i) => ({
        scanId: `scan-${i}`,
        timestamp: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      }))

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        mockHistory.map((h) => JSON.stringify(h)).join('\n'),
      )

      const history = await securityScanner.loadScanHistory(10)

      expect(history).toHaveLength(10)
    })

    it('should handle corrupted history file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json\n{broken')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const history = await securityScanner.loadScanHistory()

      expect(history).toEqual([])
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('deleteScanResult', () => {
    it('should delete scan result file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      const result = await securityScanner.deleteScanResult('test-scan-123')

      expect(result).toBe(true)
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockDataDir, 'test-scan-123.json'))
    })

    it('should return false if scan result does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await securityScanner.deleteScanResult('nonexistent')

      expect(result).toBe(false)
      expect(fs.unlinkSync).not.toHaveBeenCalled()
    })

    it('should handle deletion errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      await expect(securityScanner.deleteScanResult('test-scan-123')).rejects.toThrow()
    })
  })

  describe('exportScanResult', () => {
    const mockResult = {
      scanId: 'test-scan-123',
      timestamp: '2024-01-01T10:00:00Z',
      totalIssues: 2,
      criticalIssues: 1,
      highIssues: 1,
      mediumIssues: 0,
      lowIssues: 0,
      issues: [
        {
          id: 'issue-1',
          severity: 'critical' as const,
          type: 'SQL Injection',
          description: 'Potential SQL injection vulnerability',
          file: '/test/file.js',
          line: 10,
          cwe: 'CWE-89',
          suggestion: 'Use parameterized queries',
        },
        {
          id: 'issue-2',
          severity: 'high' as const,
          type: 'XSS',
          description: 'Potential XSS vulnerability',
          file: '/test/file.js',
          line: 20,
          cwe: 'CWE-79',
          suggestion: 'Sanitize user input',
        },
      ],
      scannedFiles: ['/test/file.js'],
      scanDuration: 1000,
    }

    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockResult))
    })

    it('should export to JSON by default', async () => {
      await securityScanner.exportScanResult('test-scan-123', '/export/result.json')

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/export/result.json',
        JSON.stringify(mockResult, null, 2),
      )
    })

    it('should export to CSV format', async () => {
      await securityScanner.exportScanResult('test-scan-123', '/export/result.csv')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/export/result.csv')

      expect(writeCall).toBeDefined()
      const csvContent = writeCall![1] as string
      expect(csvContent).toContain('File,Line,Severity,Type,Description,CWE,Suggestion')
      expect(csvContent).toContain('SQL Injection')
      expect(csvContent).toContain('CWE-89')
    })

    it('should export to HTML format', async () => {
      await securityScanner.exportScanResult('test-scan-123', '/export/result.html')

      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0] === '/export/result.html')

      expect(writeCall).toBeDefined()
      const htmlContent = writeCall![1] as string
      expect(htmlContent).toContain('<!DOCTYPE html>')
      expect(htmlContent).toContain('Security Scan Report')
      expect(htmlContent).toContain('SQL Injection')
      expect(htmlContent).toContain('CWE-89')
    })

    it('should handle nonexistent scan result', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(
        securityScanner.exportScanResult('nonexistent', '/export/result.json'),
      ).rejects.toThrow('Scan result nonexistent not found')
    })
  })

  describe('security rules', () => {
    it('should have comprehensive security rules', () => {
      expect(SECURITY_RULES.length).toBeGreaterThan(10)

      // Check for essential security rule categories
      const ruleTypes = SECURITY_RULES.map((rule) => rule.name.toLowerCase())
      expect(ruleTypes.some((type) => type.includes('sql injection'))).toBe(true)
      expect(ruleTypes.some((type) => type.includes('xss'))).toBe(true)
      expect(ruleTypes.some((type) => type.includes('hardcoded'))).toBe(true)
      expect(ruleTypes.some((type) => type.includes('command injection'))).toBe(true)
      expect(ruleTypes.some((type) => type.includes('path traversal'))).toBe(true)
    })

    it('should have valid rule structure', () => {
      for (const rule of SECURITY_RULES) {
        expect(rule.id).toBeDefined()
        expect(rule.name).toBeDefined()
        expect(['critical', 'high', 'medium', 'low']).toContain(rule.severity)
        expect(rule.pattern).toBeInstanceOf(RegExp)
        expect(rule.description).toBeDefined()
        expect(rule.suggestion).toBeDefined()
        expect(Array.isArray(rule.fileTypes)).toBe(true)
        expect(rule.fileTypes.length).toBeGreaterThan(0)
      }
    })
  })
})
