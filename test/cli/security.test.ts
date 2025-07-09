import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleSecurityCommand } from '../../src/cli/security.js'
import { SecurityScanner } from '../../src/features/security-scanner.js'

vi.mock('../../src/features/security-scanner.js')
vi.mock('../../src/utils/logging.js')

describe('handleSecurityCommand', () => {
  let mockSecurityScanner: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    mockSecurityScanner = {
      scanDirectory: vi.fn().mockResolvedValue({
        scanId: 'test-scan-123',
        timestamp: '2024-01-01T10:00:00Z',
        totalIssues: 3,
        criticalIssues: 1,
        highIssues: 1,
        mediumIssues: 1,
        lowIssues: 0,
        issues: [
          {
            id: 'issue-1',
            severity: 'critical',
            type: 'SQL Injection',
            description: 'Potential SQL injection vulnerability',
            file: '/test/file.js',
            line: 10,
            cwe: 'CWE-89',
            suggestion: 'Use parameterized queries',
            code: 'SELECT * FROM users WHERE id = " + userId'
          },
          {
            id: 'issue-2',
            severity: 'high',
            type: 'XSS Vulnerability',
            description: 'Potential XSS vulnerability',
            file: '/test/file.js',
            line: 20,
            cwe: 'CWE-79',
            suggestion: 'Sanitize user input',
            code: 'innerHTML = userInput'
          },
          {
            id: 'issue-3',
            severity: 'medium',
            type: 'Weak Crypto',
            description: 'Use of weak cryptographic function',
            file: '/test/crypto.js',
            line: 5,
            cwe: 'CWE-327',
            suggestion: 'Use SHA-256 instead',
            code: 'md5(password)'
          }
        ],
        scannedFiles: ['/test/file.js', '/test/crypto.js'],
        scanDuration: 1500
      }),
      loadScanHistory: vi.fn().mockResolvedValue([
        {
          scanId: 'scan-1',
          timestamp: '2024-01-01T10:00:00Z',
          totalIssues: 5,
          criticalIssues: 2,
          highIssues: 1,
          scannedFiles: 10,
          scanDuration: 2000
        },
        {
          scanId: 'scan-2',
          timestamp: '2024-01-01T09:00:00Z',
          totalIssues: 0,
          criticalIssues: 0,
          highIssues: 0,
          scannedFiles: 8,
          scanDuration: 1000
        }
      ]),
      loadScanResult: vi.fn().mockResolvedValue({
        scanId: 'test-scan-123',
        timestamp: '2024-01-01T10:00:00Z',
        totalIssues: 1,
        criticalIssues: 1,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        issues: [
          {
            id: 'issue-1',
            severity: 'critical',
            type: 'SQL Injection',
            description: 'Potential SQL injection vulnerability',
            file: '/test/file.js',
            line: 10,
            cwe: 'CWE-89',
            suggestion: 'Use parameterized queries'
          }
        ],
        scannedFiles: ['/test/file.js'],
        scanDuration: 1000
      }),
      exportScanResult: vi.fn(),
      deleteScanResult: vi.fn().mockResolvedValue(true)
    }
    
    vi.mocked(SecurityScanner).mockImplementation(() => mockSecurityScanner)
    
    // Mock console.log to avoid output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project')
  })

  it('should show help when no command provided', async () => {
    await handleSecurityCommand([])
    
    expect(console.log).toHaveBeenCalledWith('Security scanning commands:')
  })

  describe('scan command', () => {
    it('should perform security scan on current directory', async () => {
      await handleSecurityCommand(['scan'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: undefined,
        includePatterns: undefined,
        maxFileSize: 10 * 1024 * 1024
      })
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Starting security scan'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-scan-123'))
    })

    it('should scan specified directory', async () => {
      await handleSecurityCommand(['scan', '/custom/path'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/custom/path', {
        excludePatterns: undefined,
        includePatterns: undefined,
        maxFileSize: 10 * 1024 * 1024
      })
    })

    it('should apply exclude patterns', async () => {
      await handleSecurityCommand(['scan', '--exclude=node_modules', '--exclude=dist'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: ['node_modules', 'dist'],
        includePatterns: undefined,
        maxFileSize: 10 * 1024 * 1024
      })
    })

    it('should apply include patterns', async () => {
      await handleSecurityCommand(['scan', '--include=*.js', '--include=*.ts'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: undefined,
        includePatterns: ['*.js', '*.ts'],
        maxFileSize: 10 * 1024 * 1024
      })
    })

    it('should parse max file size in MB', async () => {
      await handleSecurityCommand(['scan', '--max-size=5mb'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: undefined,
        includePatterns: undefined,
        maxFileSize: 5 * 1024 * 1024
      })
    })

    it('should parse max file size in KB', async () => {
      await handleSecurityCommand(['scan', '--max-size=500kb'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: undefined,
        includePatterns: undefined,
        maxFileSize: 500 * 1024
      })
    })

    it('should parse max file size in bytes', async () => {
      await handleSecurityCommand(['scan', '--max-size=1000'])
      
      expect(mockSecurityScanner.scanDirectory).toHaveBeenCalledWith('/test/project', {
        excludePatterns: undefined,
        includePatterns: undefined,
        maxFileSize: 1000
      })
    })

    it('should output JSON format when requested', async () => {
      await handleSecurityCommand(['scan', '--format=json'])
      
      const result = mockSecurityScanner.scanDirectory.mock.results[0].value
      expect(console.log).toHaveBeenCalledWith(JSON.stringify(await result, null, 2))
    })

    it('should display issues grouped by file', async () => {
      await handleSecurityCommand(['scan'])
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Security Scan Results'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Critical: 1'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('High: 1'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Medium: 1'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SQL Injection'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('CWE-89'))
    })

    it('should handle scan with no issues found', async () => {
      mockSecurityScanner.scanDirectory.mockResolvedValue({
        scanId: 'clean-scan',
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        issues: [],
        scannedFiles: ['/test/file.js'],
        scanDuration: 500
      })
      
      await handleSecurityCommand(['scan'])
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No security issues found!'))
    })

    it('should handle scan errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.scanDirectory.mockRejectedValue(new Error('Scan failed'))
      
      await handleSecurityCommand(['scan'])
      
      expect(warn).toHaveBeenCalledWith('Failed to perform security scan: Scan failed')
    })
  })

  describe('list command', () => {
    it('should list recent scans', async () => {
      await handleSecurityCommand(['list'])
      
      expect(mockSecurityScanner.loadScanHistory).toHaveBeenCalledWith(20)
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Scan History'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('scan-1'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('scan-2'))
    })

    it('should list scans with custom limit', async () => {
      await handleSecurityCommand(['list', '--limit=5'])
      
      expect(mockSecurityScanner.loadScanHistory).toHaveBeenCalledWith(5)
    })

    it('should warn for invalid limit', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['list', '--limit=invalid'])
      
      expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
    })

    it('should warn for negative limit', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['list', '--limit=-5'])
      
      expect(warn).toHaveBeenCalledWith('Limit must be a positive number')
    })

    it('should show message when no scans found', async () => {
      mockSecurityScanner.loadScanHistory.mockResolvedValue([])
      
      await handleSecurityCommand(['list'])
      
      expect(console.log).toHaveBeenCalledWith('No security scans found.')
    })

    it('should handle list errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.loadScanHistory.mockRejectedValue(new Error('List failed'))
      
      await handleSecurityCommand(['list'])
      
      expect(warn).toHaveBeenCalledWith('Failed to list scans: List failed')
    })
  })

  describe('show command', () => {
    it('should show scan details', async () => {
      await handleSecurityCommand(['show', 'test-scan-123'])
      
      expect(mockSecurityScanner.loadScanResult).toHaveBeenCalledWith('test-scan-123')
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Security Scan Details'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-scan-123'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SQL Injection'))
    })

    it('should warn when no scan ID provided', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['show'])
      
      expect(warn).toHaveBeenCalledWith('Please provide a scan ID')
    })

    it('should warn when scan not found', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.loadScanResult.mockResolvedValue(null)
      
      await handleSecurityCommand(['show', 'nonexistent'])
      
      expect(warn).toHaveBeenCalledWith('Scan result nonexistent not found')
    })

    it('should handle show errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.loadScanResult.mockRejectedValue(new Error('Show failed'))
      
      await handleSecurityCommand(['show', 'test-scan-123'])
      
      expect(warn).toHaveBeenCalledWith('Failed to show scan details: Show failed')
    })
  })

  describe('export command', () => {
    it('should export scan results', async () => {
      const { log } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['export', 'test-scan-123', '/export/results.json'])
      
      expect(mockSecurityScanner.exportScanResult).toHaveBeenCalledWith('test-scan-123', '/export/results.json')
      expect(log).toHaveBeenCalledWith('✅ Scan results exported to: /export/results.json')
    })

    it('should show HTML tip for HTML exports', async () => {
      const { log } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['export', 'test-scan-123', '/export/results.html'])
      
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Open the HTML file in a web browser'))
    })

    it('should warn when missing arguments', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['export', 'test-scan-123'])
      
      expect(warn).toHaveBeenCalledWith('Please provide scan ID and output file path')
    })

    it('should warn when no scan ID provided', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['export'])
      
      expect(warn).toHaveBeenCalledWith('Please provide scan ID and output file path')
    })

    it('should handle export errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.exportScanResult.mockRejectedValue(new Error('Export failed'))
      
      await handleSecurityCommand(['export', 'test-scan-123', '/export/results.json'])
      
      expect(warn).toHaveBeenCalledWith('Failed to export scan results: Export failed')
    })
  })

  describe('delete command', () => {
    it('should delete scan results', async () => {
      const { log } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['delete', 'test-scan-123'])
      
      expect(mockSecurityScanner.deleteScanResult).toHaveBeenCalledWith('test-scan-123')
      expect(log).toHaveBeenCalledWith('✅ Scan result test-scan-123 deleted successfully')
    })

    it('should warn when scan not found', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.deleteScanResult.mockResolvedValue(false)
      
      await handleSecurityCommand(['delete', 'nonexistent'])
      
      expect(warn).toHaveBeenCalledWith('Scan result nonexistent not found')
    })

    it('should warn when no scan ID provided', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      await handleSecurityCommand(['delete'])
      
      expect(warn).toHaveBeenCalledWith('Please provide a scan ID')
    })

    it('should handle delete errors', async () => {
      const { warn } = await import('../../src/utils/logging.js')
      
      mockSecurityScanner.deleteScanResult.mockRejectedValue(new Error('Delete failed'))
      
      await handleSecurityCommand(['delete', 'test-scan-123'])
      
      expect(warn).toHaveBeenCalledWith('Failed to delete scan result: Delete failed')
    })
  })

  describe('rules command', () => {
    it('should show security rules', async () => {
      await handleSecurityCommand(['rules'])
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Security Rules'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('CRITICAL SEVERITY RULES'))
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('cwe.mitre.org'))
    })
  })

  it('should warn on unknown command', async () => {
    const { warn } = await import('../../src/utils/logging.js')
    
    await handleSecurityCommand(['unknown'])
    
    expect(warn).toHaveBeenCalledWith('Unknown security command: unknown')
  })

  it('should handle console output with colors', async () => {
    await handleSecurityCommand(['scan'])
    
    // Check that colored output is used
    const consoleCalls = vi.mocked(console.log).mock.calls
    const hasColoredOutput = consoleCalls.some(call => 
      call.some(arg => typeof arg === 'string' && arg.includes('\\x1b['))
    )
    
    expect(hasColoredOutput).toBe(true)
  })

  it('should show severity icons and statistics', async () => {
    await handleSecurityCommand(['scan'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🚨'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠️'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ℹ️'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅'))
  })

  it('should group issues by file in output', async () => {
    await handleSecurityCommand(['scan'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('📄 file.js'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('📄 crypto.js'))
  })

  it('should show scan statistics', async () => {
    await handleSecurityCommand(['scan'])
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Files Scanned: 2'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Duration: 1.50s'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total: 3'))
  })
})