import * as fs from 'fs'
import * as path from 'path'
import { CONFIG_PATHS } from '../config/paths.js'

export interface SecurityIssue {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  type: string
  description: string
  file: string
  line?: number
  column?: number
  code?: string
  suggestion?: string
  cwe?: string
}

export interface SecurityScanResult {
  scanId: string
  timestamp: string
  totalIssues: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  issues: SecurityIssue[]
  scannedFiles: string[]
  scanDuration: number
}

export interface SecurityRule {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  pattern: RegExp
  description: string
  suggestion: string
  cwe?: string
  fileTypes: string[]
}

export const SECURITY_RULES: SecurityRule[] = [
  // SQL Injection patterns
  {
    id: 'sql-injection-1',
    name: 'Potential SQL Injection',
    severity: 'critical',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER).*\+.*(?:userId|userInput|req\.)/gi,
    description: 'String concatenation in SQL query may lead to SQL injection',
    suggestion: 'Use parameterized queries or prepared statements',
    cwe: 'CWE-89',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py', '.java', '.cs'],
  },
  {
    id: 'sql-injection-2',
    name: 'Potential SQL Injection',
    severity: 'critical',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*\+\s*["`'][^"`']*["`']\s*\+/gi,
    description: 'String concatenation in SQL query may lead to SQL injection',
    suggestion: 'Use parameterized queries or prepared statements',
    cwe: 'CWE-89',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py', '.java', '.cs'],
  },

  // XSS patterns
  {
    id: 'xss-1',
    name: 'Potential XSS Vulnerability',
    severity: 'high',
    pattern: /innerHTML\s*=\s*[^;]*\$\{[^}]+\}/gi,
    description: 'Setting innerHTML with user input may lead to XSS attacks',
    suggestion: 'Use textContent or sanitize HTML input',
    cwe: 'CWE-79',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },
  {
    id: 'xss-2',
    name: 'Potential XSS Vulnerability',
    severity: 'high',
    pattern: /document\.write\s*\([^)]*\$\{[^}]+\}/gi,
    description: 'Using document.write with user input may lead to XSS attacks',
    suggestion: 'Avoid document.write or sanitize input',
    cwe: 'CWE-79',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },

  // Hardcoded secrets
  {
    id: 'hardcoded-password',
    name: 'Hardcoded Password',
    severity: 'critical',
    pattern: /(?:password|pwd|pass)\s*[:=]\s*["`'][^"`']{6,}["`']/gi,
    description: 'Hardcoded password found in source code',
    suggestion: 'Use environment variables or secure configuration',
    cwe: 'CWE-798',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.php', '.rb'],
  },
  {
    id: 'hardcoded-api-key',
    name: 'Hardcoded API Key',
    severity: 'critical',
    pattern:
      /(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key)\s*[:=]\s*["`'][A-Za-z0-9_\-]{10,}["`']/gi,
    description: 'Hardcoded API key or access token found in source code',
    suggestion: 'Use environment variables or secure configuration',
    cwe: 'CWE-798',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.php', '.rb'],
  },

  // Command injection
  {
    id: 'command-injection-1',
    name: 'Potential Command Injection',
    severity: 'critical',
    pattern: /(?:exec|system|shell_exec|eval|spawn)\s*\([^)]*\$\{[^}]+\}/gi,
    description: 'Command execution with user input may lead to command injection',
    suggestion: 'Validate and sanitize input, use safe alternatives',
    cwe: 'CWE-78',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py', '.rb'],
  },

  // Path traversal
  {
    id: 'path-traversal',
    name: 'Potential Path Traversal',
    severity: 'high',
    pattern: /(?:readFile|writeFile|unlink|mkdir|rmdir)\s*\([^)]*\.\.[/\\]/gi,
    description: 'Path traversal vulnerability may allow access to unauthorized files',
    suggestion: 'Validate and sanitize file paths, use path.join() safely',
    cwe: 'CWE-22',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.cs'],
  },

  // Weak cryptography
  {
    id: 'weak-crypto-md5',
    name: 'Weak Cryptographic Hash',
    severity: 'medium',
    pattern: /md5\s*\(/gi,
    description: 'MD5 is cryptographically broken and should not be used',
    suggestion: 'Use SHA-256 or SHA-3 for cryptographic purposes',
    cwe: 'CWE-327',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.cs', '.rb'],
  },
  {
    id: 'weak-crypto-sha1',
    name: 'Weak Cryptographic Hash',
    severity: 'medium',
    pattern: /sha1\s*\(/gi,
    description: 'SHA-1 is cryptographically weak and should be avoided',
    suggestion: 'Use SHA-256 or SHA-3 for cryptographic purposes',
    cwe: 'CWE-327',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.py', '.php', '.java', '.cs', '.rb'],
  },

  // Insecure random
  {
    id: 'insecure-random',
    name: 'Insecure Random Number Generation',
    severity: 'medium',
    pattern: /Math\.random\s*\(\)/gi,
    description: 'Math.random() is not cryptographically secure',
    suggestion: 'Use crypto.randomBytes() or crypto.getRandomValues() for security purposes',
    cwe: 'CWE-338',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },

  // CORS issues
  {
    id: 'cors-wildcard',
    name: 'Permissive CORS Policy',
    severity: 'high',
    pattern: /(?:Access-Control-Allow-Origin|setHeader.*Allow-Origin).*["`']\*["`']/gi,
    description: 'Wildcard CORS policy allows requests from any origin',
    suggestion: 'Specify allowed origins explicitly',
    cwe: 'CWE-942',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py', '.java', '.cs'],
  },

  // Dangerous functions
  {
    id: 'dangerous-eval',
    name: 'Dangerous Function Usage',
    severity: 'high',
    pattern: /\beval\s*\(/gi,
    description: 'eval() can execute arbitrary code and is dangerous',
    suggestion: 'Avoid eval(), use JSON.parse() for JSON or other safe alternatives',
    cwe: 'CWE-95',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },

  // Cookie security
  {
    id: 'insecure-cookie',
    name: 'Insecure Cookie Configuration',
    severity: 'medium',
    pattern: /Set-Cookie:(?!.*secure)(?!.*httponly)/gi,
    description: 'Cookie missing Secure and HttpOnly flags',
    suggestion: 'Add Secure and HttpOnly flags to cookies',
    cwe: 'CWE-614',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.php', '.py'],
  },
]

export class SecurityScanner {
  private dataDir: string

  constructor() {
    this.dataDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'security-scans')
    this.ensureDataDirectory()
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  async scanDirectory(
    directoryPath: string,
    options: {
      includePatterns?: string[]
      excludePatterns?: string[]
      maxFileSize?: number
      followSymlinks?: boolean
    } = {},
  ): Promise<SecurityScanResult> {
    const startTime = Date.now()
    const scanId = this.generateScanId()
    const issues: SecurityIssue[] = []
    const scannedFiles: string[] = []

    const {
      includePatterns = [
        '**/*.js',
        '**/*.ts',
        '**/*.jsx',
        '**/*.tsx',
        '**/*.py',
        '**/*.php',
        '**/*.java',
        '**/*.cs',
        '**/*.rb',
      ],
      excludePatterns = [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/vendor/**',
      ],
      maxFileSize = 10 * 1024 * 1024, // 10MB
      followSymlinks = false,
    } = options

    try {
      const filesToScan = await this.findFilesToScan(
        directoryPath,
        includePatterns,
        excludePatterns,
        maxFileSize,
        followSymlinks,
      )

      for (const filePath of filesToScan) {
        try {
          const fileIssues = await this.scanFile(filePath)
          issues.push(...fileIssues)
          scannedFiles.push(filePath)
        } catch (error) {
          console.warn(`Failed to scan file ${filePath}: ${error.message}`)
        }
      }

      const scanDuration = Date.now() - startTime
      const result: SecurityScanResult = {
        scanId,
        timestamp: new Date().toISOString(),
        totalIssues: issues.length,
        criticalIssues: issues.filter((i) => i.severity === 'critical').length,
        highIssues: issues.filter((i) => i.severity === 'high').length,
        mediumIssues: issues.filter((i) => i.severity === 'medium').length,
        lowIssues: issues.filter((i) => i.severity === 'low').length,
        issues,
        scannedFiles,
        scanDuration,
      }

      // Save scan result
      await this.saveScanResult(result)

      return result
    } catch (error) {
      throw new Error(`Security scan failed: ${error.message}`)
    }
  }

  async scanFile(filePath: string): Promise<SecurityIssue[]> {
    const issues: SecurityIssue[] = []
    const fileExtension = path.extname(filePath)

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n')

      // Apply security rules
      for (const rule of SECURITY_RULES) {
        if (!rule.fileTypes.includes(fileExtension)) {
          continue
        }

        const matches = content.matchAll(rule.pattern)
        for (const match of matches) {
          if (match.index !== undefined) {
            const lineNumber = this.getLineNumber(content, match.index)
            const lineContent = lines[lineNumber - 1]?.trim()

            issues.push({
              id: this.generateIssueId(),
              severity: rule.severity,
              type: rule.name,
              description: rule.description,
              file: filePath,
              line: lineNumber,
              column: match.index - content.lastIndexOf('\n', match.index) - 1,
              code: lineContent,
              suggestion: rule.suggestion,
              cwe: rule.cwe,
            })
          }
        }
      }

      // Additional context-specific checks
      if (fileExtension === '.js' || fileExtension === '.ts') {
        issues.push(...this.scanJavaScriptSpecific(filePath, content, lines))
      }
    } catch (error) {
      throw new Error(`Failed to scan file ${filePath}: ${error.message}`)
    }

    return issues
  }

  private scanJavaScriptSpecific(
    filePath: string,
    content: string,
    lines: string[],
  ): SecurityIssue[] {
    const issues: SecurityIssue[] = []

    // Check for dangerous npm packages
    const dangerousPackages = ['eval', 'vm2', 'serialize-javascript']
    for (const pkg of dangerousPackages) {
      const importRegex = new RegExp(`(?:import|require)\\s*\\(?\\s*['"]\s*${pkg}\s*['"]`, 'gi')
      const matches = content.matchAll(importRegex)

      for (const match of matches) {
        if (match.index !== undefined) {
          const lineNumber = this.getLineNumber(content, match.index)
          issues.push({
            id: this.generateIssueId(),
            severity: 'high',
            type: 'Dangerous Package Import',
            description: `Import of potentially dangerous package '${pkg}'`,
            file: filePath,
            line: lineNumber,
            code: lines[lineNumber - 1]?.trim(),
            suggestion: 'Review the necessity of this package and consider safer alternatives',
            cwe: 'CWE-829',
          })
        }
      }
    }

    // Check for prototype pollution
    const prototypePattern = /(\w+)\.prototype\s*\[\s*[^[\]]*\s*\]\s*=/gi
    const prototypeMatches = content.matchAll(prototypePattern)

    for (const match of prototypeMatches) {
      if (match.index !== undefined) {
        const lineNumber = this.getLineNumber(content, match.index)
        issues.push({
          id: this.generateIssueId(),
          severity: 'medium',
          type: 'Potential Prototype Pollution',
          description: 'Direct prototype modification may lead to prototype pollution',
          file: filePath,
          line: lineNumber,
          code: lines[lineNumber - 1]?.trim(),
          suggestion: 'Use Object.defineProperty() or avoid prototype modification',
          cwe: 'CWE-1321',
        })
      }
    }

    return issues
  }

  private async findFilesToScan(
    directoryPath: string,
    includePatterns: string[],
    excludePatterns: string[],
    maxFileSize: number,
    followSymlinks: boolean,
  ): Promise<string[]> {
    const files: string[] = []

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = path.relative(directoryPath, fullPath)

        // Check exclude patterns
        if (excludePatterns.some((pattern) => this.matchGlob(relativePath, pattern))) {
          continue
        }

        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() || (followSymlinks && entry.isSymbolicLink())) {
          // Check include patterns
          if (includePatterns.some((pattern) => this.matchGlob(relativePath, pattern))) {
            try {
              const stats = fs.statSync(fullPath)
              if (stats.size <= maxFileSize) {
                files.push(fullPath)
              }
            } catch (error) {
              // Skip files we can't stat
            }
          }
        }
      }
    }

    walk(directoryPath)
    return files
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching - in production, you'd use a proper glob library
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')

    return new RegExp(`^${regexPattern}$`).test(filePath)
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length
  }

  private generateScanId(): string {
    return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  private generateIssueId(): string {
    return `issue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  async saveScanResult(result: SecurityScanResult): Promise<void> {
    const filePath = path.join(this.dataDir, `${result.scanId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2))

    // Also append to scan history
    const historyPath = path.join(this.dataDir, 'scan-history.jsonl')
    const historySummary = {
      scanId: result.scanId,
      timestamp: result.timestamp,
      totalIssues: result.totalIssues,
      criticalIssues: result.criticalIssues,
      highIssues: result.highIssues,
      scannedFiles: result.scannedFiles.length,
      scanDuration: result.scanDuration,
    }

    fs.appendFileSync(historyPath, JSON.stringify(historySummary) + '\n')
  }

  async loadScanResult(scanId: string): Promise<SecurityScanResult | null> {
    const filePath = path.join(this.dataDir, `${scanId}.json`)

    if (!fs.existsSync(filePath)) {
      return null
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to load scan result: ${error.message}`)
    }
  }

  async loadScanHistory(limit: number = 20): Promise<any[]> {
    const historyPath = path.join(this.dataDir, 'scan-history.jsonl')

    if (!fs.existsSync(historyPath)) {
      return []
    }

    try {
      const content = fs.readFileSync(historyPath, 'utf8')
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line)

      const history = lines
        .map((line) => JSON.parse(line))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)

      return history
    } catch (error) {
      console.warn('Failed to load scan history:', error.message)
      return []
    }
  }

  async deleteScanResult(scanId: string): Promise<boolean> {
    const filePath = path.join(this.dataDir, `${scanId}.json`)

    if (!fs.existsSync(filePath)) {
      return false
    }

    try {
      fs.unlinkSync(filePath)
      return true
    } catch (error) {
      throw new Error(`Failed to delete scan result: ${error.message}`)
    }
  }

  async exportScanResult(scanId: string, outputPath: string): Promise<void> {
    const result = await this.loadScanResult(scanId)

    if (!result) {
      throw new Error(`Scan result ${scanId} not found`)
    }

    // Create different export formats based on file extension
    const ext = path.extname(outputPath).toLowerCase()

    if (ext === '.csv') {
      await this.exportToCSV(result, outputPath)
    } else if (ext === '.html') {
      await this.exportToHTML(result, outputPath)
    } else {
      // Default to JSON
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
    }
  }

  private async exportToCSV(result: SecurityScanResult, outputPath: string): Promise<void> {
    const headers = ['File', 'Line', 'Severity', 'Type', 'Description', 'CWE', 'Suggestion']
    const rows = [headers.join(',')]

    for (const issue of result.issues) {
      const row = [
        `"${issue.file}"`,
        issue.line?.toString() || '',
        issue.severity,
        `"${issue.type}"`,
        `"${issue.description}"`,
        issue.cwe || '',
        `"${issue.suggestion || ''}"`,
      ]
      rows.push(row.join(','))
    }

    fs.writeFileSync(outputPath, rows.join('\n'))
  }

  private async exportToHTML(result: SecurityScanResult, outputPath: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Security Scan Report - ${result.scanId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat { background: #e9ecef; padding: 10px; border-radius: 5px; text-align: center; }
        .critical { background: #dc3545; color: white; }
        .high { background: #fd7e14; color: white; }
        .medium { background: #ffc107; }
        .low { background: #28a745; color: white; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; }
        .severity-critical { background-color: #f8d7da; }
        .severity-high { background-color: #fff3cd; }
        .severity-medium { background-color: #d1ecf1; }
        .severity-low { background-color: #d4edda; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Scan Report</h1>
        <p><strong>Scan ID:</strong> ${result.scanId}</p>
        <p><strong>Timestamp:</strong> ${new Date(result.timestamp).toLocaleString()}</p>
        <p><strong>Duration:</strong> ${(result.scanDuration / 1000).toFixed(2)}s</p>
    </div>
    
    <div class="summary">
        <div class="stat critical">
            <h3>${result.criticalIssues}</h3>
            <p>Critical</p>
        </div>
        <div class="stat high">
            <h3>${result.highIssues}</h3>
            <p>High</p>
        </div>
        <div class="stat medium">
            <h3>${result.mediumIssues}</h3>
            <p>Medium</p>
        </div>
        <div class="stat low">
            <h3>${result.lowIssues}</h3>
            <p>Low</p>
        </div>
    </div>
    
    <h2>Issues Found</h2>
    <table>
        <thead>
            <tr>
                <th>Severity</th>
                <th>Type</th>
                <th>File</th>
                <th>Line</th>
                <th>Description</th>
                <th>CWE</th>
            </tr>
        </thead>
        <tbody>
            ${result.issues
              .map(
                (issue) => `
                <tr class="severity-${issue.severity}">
                    <td>${issue.severity.toUpperCase()}</td>
                    <td>${issue.type}</td>
                    <td>${issue.file}</td>
                    <td>${issue.line || ''}</td>
                    <td>${issue.description}</td>
                    <td>${issue.cwe || ''}</td>
                </tr>
            `,
              )
              .join('')}
        </tbody>
    </table>
</body>
</html>`

    fs.writeFileSync(outputPath, html)
  }
}
