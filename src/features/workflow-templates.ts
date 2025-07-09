import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { CONFIG_PATHS } from '../config/paths.js'

export interface WorkflowStep {
  name: string
  description?: string
  prompt: string
  requiresConfirmation?: boolean
  expectedFiles?: string[]
  successCriteria?: string[]
  variables?: Record<string, string>
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'development' | 'testing' | 'refactoring' | 'documentation' | 'debugging' | 'security' | 'custom'
  tags: string[]
  steps: WorkflowStep[]
  variables?: Record<string, {
    description: string
    default?: string
    required?: boolean
    pattern?: string
  }>
  prerequisites?: string[]
  created: string
  updated: string
  author?: string
  version?: string
}

export interface WorkflowExecution {
  id: string
  templateId: string
  templateName: string
  startTime: string
  endTime?: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  currentStep: number
  totalSteps: number
  variables: Record<string, string>
  results: {
    stepIndex: number
    stepName: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    startTime?: string
    endTime?: string
    output?: string
    error?: string
  }[]
}

export class WorkflowTemplateManager {
  private templatesDir: string
  private executionsDir: string
  private templates: Map<string, WorkflowTemplate> = new Map()
  private builtInTemplates: WorkflowTemplate[] = []

  constructor() {
    this.templatesDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'workflows', 'templates')
    this.executionsDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'workflows', 'executions')
    this.ensureDirectories()
    this.loadBuiltInTemplates()
    this.loadCustomTemplates()
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true })
    }
    if (!fs.existsSync(this.executionsDir)) {
      fs.mkdirSync(this.executionsDir, { recursive: true })
    }
  }

  private loadBuiltInTemplates(): void {
    this.builtInTemplates = [
      {
        id: 'add-tests',
        name: 'Add Unit Tests',
        description: 'Add comprehensive unit tests for existing code',
        category: 'testing',
        tags: ['testing', 'quality', 'coverage'],
        steps: [
          {
            name: 'Analyze Code',
            description: 'Analyze the code structure and identify testable components',
            prompt: 'Analyze the code in {{targetFile}} and identify all functions, classes, and methods that need unit tests. List them with their expected behaviors.',
            variables: { targetFile: '' }
          },
          {
            name: 'Generate Test Structure',
            description: 'Create the test file structure',
            prompt: 'Create a test file for {{targetFile}} with proper imports and describe blocks for each component identified in the previous step.',
            expectedFiles: ['{{testFile}}'],
            variables: { targetFile: '', testFile: '' }
          },
          {
            name: 'Write Test Cases',
            description: 'Write comprehensive test cases',
            prompt: 'Write comprehensive unit tests for all functions in {{targetFile}}. Include edge cases, error scenarios, and mock external dependencies.',
            successCriteria: ['All functions have tests', 'Edge cases covered', 'Mocks properly configured'],
            variables: { targetFile: '' }
          },
          {
            name: 'Run Tests',
            description: 'Execute the tests and ensure they pass',
            prompt: 'Run the test suite and fix any failing tests. Ensure all tests pass with good coverage.',
            requiresConfirmation: true
          }
        ],
        variables: {
          targetFile: {
            description: 'The file to add tests for',
            required: true,
            pattern: '.*\\.(js|ts|jsx|tsx)$'
          },
          testFile: {
            description: 'The test file path',
            default: '{{targetFile.replace(/\\.([^.]+)$/, ".test.$1")}}'
          }
        },
        prerequisites: ['Test framework installed (Jest/Vitest)', 'Project has test configuration'],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Coda Team',
        version: '1.0.0'
      },
      {
        id: 'refactor-extract-function',
        name: 'Extract Function Refactoring',
        description: 'Extract complex code into well-named functions',
        category: 'refactoring',
        tags: ['refactoring', 'clean-code', 'maintainability'],
        steps: [
          {
            name: 'Identify Complex Code',
            description: 'Find code blocks that should be extracted',
            prompt: 'Analyze {{targetFile}} and identify complex code blocks that would benefit from being extracted into separate functions. Look for: repeated code, complex conditionals, long methods, and code with unclear intent.',
            variables: { targetFile: '' }
          },
          {
            name: 'Plan Refactoring',
            description: 'Plan the function extraction',
            prompt: 'For each identified code block, suggest: 1) A descriptive function name, 2) Parameters needed, 3) Return type, 4) Where to place the function. Ensure the refactoring maintains functionality.',
            requiresConfirmation: true
          },
          {
            name: 'Extract Functions',
            description: 'Perform the extraction',
            prompt: 'Extract the identified code blocks into well-named functions. Update all call sites. Ensure proper parameter passing and return values.',
            variables: { targetFile: '' }
          },
          {
            name: 'Add Documentation',
            description: 'Document the new functions',
            prompt: 'Add JSDoc/TSDoc comments to all newly created functions explaining their purpose, parameters, and return values.'
          },
          {
            name: 'Verify Functionality',
            description: 'Ensure the refactoring didn\'t break anything',
            prompt: 'Review the refactored code and verify that functionality is preserved. Run any existing tests to ensure nothing is broken.',
            requiresConfirmation: true
          }
        ],
        variables: {
          targetFile: {
            description: 'The file to refactor',
            required: true
          }
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Coda Team',
        version: '1.0.0'
      },
      {
        id: 'api-endpoint',
        name: 'Create REST API Endpoint',
        description: 'Create a new REST API endpoint with validation and error handling',
        category: 'development',
        tags: ['api', 'backend', 'rest'],
        steps: [
          {
            name: 'Define Endpoint',
            description: 'Define the endpoint specification',
            prompt: 'Create a {{method}} endpoint at {{path}} that {{description}}. Define the request/response schema, validation rules, and error cases.',
            variables: { method: 'GET', path: '/api/resource', description: '' }
          },
          {
            name: 'Implement Handler',
            description: 'Implement the endpoint handler',
            prompt: 'Implement the endpoint handler with proper request validation, business logic, and response formatting. Include appropriate error handling.',
            expectedFiles: ['{{handlerFile}}']
          },
          {
            name: 'Add Validation',
            description: 'Add input validation',
            prompt: 'Add comprehensive input validation for all request parameters, body fields, and headers. Return appropriate error messages for validation failures.'
          },
          {
            name: 'Add Tests',
            description: 'Create endpoint tests',
            prompt: 'Write integration tests for the endpoint covering: success cases, validation errors, edge cases, and error scenarios.',
            expectedFiles: ['{{testFile}}']
          },
          {
            name: 'Update Documentation',
            description: 'Document the endpoint',
            prompt: 'Update the API documentation with the new endpoint details including parameters, responses, and example usage.'
          }
        ],
        variables: {
          method: {
            description: 'HTTP method',
            default: 'GET',
            pattern: '^(GET|POST|PUT|PATCH|DELETE)$'
          },
          path: {
            description: 'API endpoint path',
            required: true,
            pattern: '^/.*'
          },
          description: {
            description: 'What the endpoint does',
            required: true
          },
          handlerFile: {
            description: 'Handler file path',
            required: true
          },
          testFile: {
            description: 'Test file path',
            default: '{{handlerFile.replace(/\\.([^.]+)$/, ".test.$1")}}'
          }
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Coda Team',
        version: '1.0.0'
      },
      {
        id: 'fix-security-issues',
        name: 'Fix Security Vulnerabilities',
        description: 'Scan and fix security issues in the codebase',
        category: 'security',
        tags: ['security', 'vulnerability', 'audit'],
        steps: [
          {
            name: 'Security Scan',
            description: 'Run security analysis',
            prompt: 'Run a comprehensive security scan on {{targetPath}} using the built-in security scanner. Identify all vulnerabilities grouped by severity.',
            variables: { targetPath: '.' },
            requiresConfirmation: true
          },
          {
            name: 'Prioritize Issues',
            description: 'Prioritize vulnerabilities',
            prompt: 'Review the security scan results and prioritize issues by: 1) Severity (critical, high, medium, low), 2) Exploitability, 3) Impact on functionality. Create a remediation plan.'
          },
          {
            name: 'Fix Critical Issues',
            description: 'Fix critical vulnerabilities',
            prompt: 'Fix all critical severity vulnerabilities identified. Use secure coding practices and industry-standard solutions. Ensure fixes don\'t break functionality.',
            requiresConfirmation: true
          },
          {
            name: 'Fix High Issues',
            description: 'Fix high severity vulnerabilities',
            prompt: 'Fix all high severity vulnerabilities. Apply proper input validation, sanitization, and secure defaults.',
            requiresConfirmation: true
          },
          {
            name: 'Verify Fixes',
            description: 'Verify all fixes',
            prompt: 'Re-run the security scan to verify all critical and high severity issues are resolved. Run tests to ensure functionality is preserved.'
          },
          {
            name: 'Document Changes',
            description: 'Document security improvements',
            prompt: 'Document all security fixes made, including: what was vulnerable, how it was fixed, and any configuration changes needed.'
          }
        ],
        variables: {
          targetPath: {
            description: 'Path to scan',
            default: '.',
            required: true
          }
        },
        prerequisites: ['Security scanner available', 'Test suite to verify fixes'],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Coda Team',
        version: '1.0.0'
      },
      {
        id: 'debug-issue',
        name: 'Debug Complex Issue',
        description: 'Systematic approach to debugging complex issues',
        category: 'debugging',
        tags: ['debugging', 'troubleshooting', 'problem-solving'],
        steps: [
          {
            name: 'Reproduce Issue',
            description: 'Reproduce the problem',
            prompt: 'Based on the issue description: "{{issueDescription}}", create minimal steps to reproduce the problem. Verify you can consistently reproduce it.',
            variables: { issueDescription: '' },
            requiresConfirmation: true
          },
          {
            name: 'Gather Information',
            description: 'Collect diagnostic information',
            prompt: 'Gather all relevant information: error messages, logs, stack traces, environment details, and recent changes. Look for patterns or clues.'
          },
          {
            name: 'Form Hypotheses',
            description: 'Develop theories about the cause',
            prompt: 'Based on the information gathered, form 3-5 hypotheses about what might be causing the issue. Rank them by likelihood.'
          },
          {
            name: 'Test Hypotheses',
            description: 'Test each hypothesis',
            prompt: 'Systematically test each hypothesis starting with the most likely. Add debug logging, use debugging tools, and isolate components.',
            requiresConfirmation: true
          },
          {
            name: 'Implement Fix',
            description: 'Fix the root cause',
            prompt: 'Once the root cause is identified, implement a proper fix. Ensure the fix addresses the root cause, not just symptoms.',
            requiresConfirmation: true
          },
          {
            name: 'Verify Fix',
            description: 'Verify the issue is resolved',
            prompt: 'Verify the fix resolves the issue completely. Test edge cases and ensure no regressions were introduced.',
            requiresConfirmation: true
          },
          {
            name: 'Add Regression Test',
            description: 'Prevent future occurrences',
            prompt: 'Add a test case that would have caught this issue. This ensures the problem doesn\'t resurface in the future.'
          }
        ],
        variables: {
          issueDescription: {
            description: 'Description of the issue',
            required: true
          }
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        author: 'Coda Team',
        version: '1.0.0'
      }
    ]

    // Add built-in templates to the map
    this.builtInTemplates.forEach(template => {
      this.templates.set(template.id, template)
    })
  }

  private loadCustomTemplates(): void {
    try {
      const files = fs.readdirSync(this.templatesDir)
      
      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          try {
            const content = fs.readFileSync(path.join(this.templatesDir, file), 'utf8')
            const template = yaml.parse(content) as WorkflowTemplate
            
            // Validate template
            if (this.validateTemplate(template)) {
              this.templates.set(template.id, template)
            }
          } catch (error) {
            console.warn(`Failed to load template ${file}:`, error.message)
          }
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  private validateTemplate(template: any): template is WorkflowTemplate {
    return (
      template &&
      typeof template.id === 'string' &&
      typeof template.name === 'string' &&
      typeof template.description === 'string' &&
      Array.isArray(template.steps) &&
      template.steps.length > 0 &&
      template.steps.every((step: any) => 
        typeof step.name === 'string' &&
        typeof step.prompt === 'string'
      )
    )
  }

  /**
   * Get all available templates
   */
  getTemplates(category?: WorkflowTemplate['category']): WorkflowTemplate[] {
    const templates = Array.from(this.templates.values())
    
    if (category) {
      return templates.filter(t => t.category === category)
    }
    
    return templates
  }

  /**
   * Get a specific template
   */
  getTemplate(id: string): WorkflowTemplate | null {
    return this.templates.get(id) || null
  }

  /**
   * Search templates by name, description, or tags
   */
  searchTemplates(query: string): WorkflowTemplate[] {
    const queryLower = query.toLowerCase()
    
    return Array.from(this.templates.values()).filter(template => 
      template.name.toLowerCase().includes(queryLower) ||
      template.description.toLowerCase().includes(queryLower) ||
      template.tags.some(tag => tag.toLowerCase().includes(queryLower))
    )
  }

  /**
   * Create a custom template
   */
  createTemplate(template: Omit<WorkflowTemplate, 'id' | 'created' | 'updated'>): WorkflowTemplate {
    const id = this.generateTemplateId(template.name)
    
    const newTemplate: WorkflowTemplate = {
      ...template,
      id,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    }
    
    // Validate
    if (!this.validateTemplate(newTemplate)) {
      throw new Error('Invalid template structure')
    }
    
    // Check if ID already exists
    if (this.templates.has(id)) {
      throw new Error(`Template with ID ${id} already exists`)
    }
    
    // Save to file
    const filePath = path.join(this.templatesDir, `${id}.yaml`)
    fs.writeFileSync(filePath, yaml.stringify(newTemplate))
    
    // Add to map
    this.templates.set(id, newTemplate)
    
    return newTemplate
  }

  /**
   * Update an existing custom template
   */
  updateTemplate(id: string, updates: Partial<Omit<WorkflowTemplate, 'id' | 'created'>>): WorkflowTemplate {
    const template = this.templates.get(id)
    
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }
    
    // Check if it's a built-in template
    if (this.builtInTemplates.some(t => t.id === id)) {
      throw new Error('Cannot modify built-in templates')
    }
    
    const updatedTemplate: WorkflowTemplate = {
      ...template,
      ...updates,
      id: template.id,
      created: template.created,
      updated: new Date().toISOString()
    }
    
    // Validate
    if (!this.validateTemplate(updatedTemplate)) {
      throw new Error('Invalid template structure')
    }
    
    // Save to file
    const filePath = path.join(this.templatesDir, `${id}.yaml`)
    fs.writeFileSync(filePath, yaml.stringify(updatedTemplate))
    
    // Update map
    this.templates.set(id, updatedTemplate)
    
    return updatedTemplate
  }

  /**
   * Delete a custom template
   */
  deleteTemplate(id: string): boolean {
    const template = this.templates.get(id)
    
    if (!template) {
      return false
    }
    
    // Check if it's a built-in template
    if (this.builtInTemplates.some(t => t.id === id)) {
      throw new Error('Cannot delete built-in templates')
    }
    
    // Delete file
    const filePath = path.join(this.templatesDir, `${id}.yaml`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    
    // Remove from map
    this.templates.delete(id)
    
    return true
  }

  /**
   * Start a workflow execution
   */
  startExecution(templateId: string, variables: Record<string, string> = {}): WorkflowExecution {
    const template = this.templates.get(templateId)
    
    if (!template) {
      throw new Error(`Template ${templateId} not found`)
    }
    
    // Validate required variables
    if (template.variables) {
      for (const [key, config] of Object.entries(template.variables)) {
        if (config.required && !variables[key]) {
          throw new Error(`Required variable '${key}' not provided`)
        }
        
        // Validate pattern if provided
        if (config.pattern && variables[key]) {
          const regex = new RegExp(config.pattern)
          if (!regex.test(variables[key])) {
            throw new Error(`Variable '${key}' does not match pattern ${config.pattern}`)
          }
        }
      }
    }
    
    // Apply defaults
    const finalVariables = { ...variables }
    if (template.variables) {
      for (const [key, config] of Object.entries(template.variables)) {
        if (config.default && !finalVariables[key]) {
          finalVariables[key] = this.interpolateVariables(config.default, finalVariables)
        }
      }
    }
    
    const execution: WorkflowExecution = {
      id: this.generateExecutionId(),
      templateId,
      templateName: template.name,
      startTime: new Date().toISOString(),
      status: 'running',
      currentStep: 0,
      totalSteps: template.steps.length,
      variables: finalVariables,
      results: template.steps.map((step, index) => ({
        stepIndex: index,
        stepName: step.name,
        status: index === 0 ? 'running' : 'pending'
      }))
    }
    
    // Save execution
    this.saveExecution(execution)
    
    return execution
  }

  /**
   * Get execution details
   */
  getExecution(executionId: string): WorkflowExecution | null {
    const filePath = path.join(this.executionsDir, `${executionId}.json`)
    
    if (!fs.existsSync(filePath)) {
      return null
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      return null
    }
  }

  /**
   * Update execution status
   */
  updateExecution(executionId: string, updates: Partial<WorkflowExecution>): WorkflowExecution {
    const execution = this.getExecution(executionId)
    
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`)
    }
    
    const updatedExecution = { ...execution, ...updates }
    this.saveExecution(updatedExecution)
    
    return updatedExecution
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit: number = 10): WorkflowExecution[] {
    try {
      const files = fs.readdirSync(this.executionsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(this.executionsDir, f),
          mtime: fs.statSync(path.join(this.executionsDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, limit)
      
      const executions: WorkflowExecution[] = []
      
      for (const file of files) {
        try {
          const content = fs.readFileSync(file.path, 'utf8')
          executions.push(JSON.parse(content))
        } catch (error) {
          // Skip corrupted files
        }
      }
      
      return executions
    } catch (error) {
      return []
    }
  }

  /**
   * Get the prompt for a specific step with variables interpolated
   */
  getStepPrompt(templateId: string, stepIndex: number, variables: Record<string, string>): string {
    const template = this.templates.get(templateId)
    
    if (!template || stepIndex >= template.steps.length) {
      throw new Error('Invalid template or step index')
    }
    
    const step = template.steps[stepIndex]
    let prompt = step.prompt
    
    // Create a copy of variables to avoid mutating the original
    const mergedVariables = { ...variables }
    
    // Merge step-specific variables (but don't overwrite provided ones)
    if (step.variables) {
      for (const [key, value] of Object.entries(step.variables)) {
        if (!(key in mergedVariables) && value !== '') {
          mergedVariables[key] = value
        }
      }
    }
    
    // Interpolate all variables
    return this.interpolateVariables(prompt, mergedVariables)
  }

  /**
   * Export a template
   */
  exportTemplate(id: string): string {
    const template = this.templates.get(id)
    
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }
    
    return yaml.stringify(template)
  }

  /**
   * Import a template
   */
  importTemplate(yamlContent: string): WorkflowTemplate {
    const parsedTemplate = yaml.parse(yamlContent) as WorkflowTemplate
    
    // Create a new template object to ensure we generate new IDs
    const template: WorkflowTemplate = {
      ...parsedTemplate,
      id: this.generateTemplateId(parsedTemplate.name),
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    }
    
    // Validate
    if (!this.validateTemplate(template)) {
      throw new Error('Invalid template structure')
    }
    
    // Save
    const filePath = path.join(this.templatesDir, `${template.id}.yaml`)
    fs.writeFileSync(filePath, yaml.stringify(template))
    
    // Add to map
    this.templates.set(template.id, template)
    
    return template
  }

  private generateTemplateId(name: string): string {
    const base = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
    let id = base
    let counter = 1
    
    while (this.templates.has(id)) {
      id = `${base}-${counter}`
      counter++
    }
    
    return id
  }

  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private interpolateVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)(?:\.([^}]+))?\}\}/g, (match, varName, transform) => {
      const value = variables[varName]
      
      if (value === undefined) {
        return match // Keep placeholder if variable not provided
      }
      
      if (transform) {
        // Handle simple transformations
        try {
          // Safe evaluation for simple string transformations
          const transformFunc = new Function('value', `return value.${transform}`)
          return transformFunc(value)
        } catch (error) {
          return value
        }
      }
      
      return value
    })
  }

  private saveExecution(execution: WorkflowExecution): void {
    const filePath = path.join(this.executionsDir, `${execution.id}.json`)
    fs.writeFileSync(filePath, JSON.stringify(execution, null, 2))
  }

  /**
   * Clean up old executions
   */
  cleanupOldExecutions(daysToKeep: number = 30): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
    let deletedCount = 0
    
    try {
      const files = fs.readdirSync(this.executionsDir)
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.executionsDir, file)
          const stats = fs.statSync(filePath)
          
          if (stats.mtime.getTime() < cutoffTime) {
            fs.unlinkSync(filePath)
            deletedCount++
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
    
    return deletedCount
  }
}