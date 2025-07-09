import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as readline from 'readline'
import { handleWorkflowCommand } from '../../src/cli/workflows.js'
import { WorkflowTemplateManager } from '../../src/features/workflow-templates.js'

vi.mock('fs')
vi.mock('readline')
vi.mock('../../src/features/workflow-templates.js')

describe('workflows CLI', () => {
  let mockManager: any
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let processExitSpy: any
  let mockReadline: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    // Mock readline
    mockReadline = {
      question: vi.fn(),
      close: vi.fn(),
    }
    vi.mocked(readline.createInterface).mockReturnValue(mockReadline as any)

    // Mock WorkflowTemplateManager
    mockManager = {
      getTemplates: vi.fn(),
      getTemplate: vi.fn(),
      searchTemplates: vi.fn(),
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      startExecution: vi.fn(),
      getExecution: vi.fn(),
      updateExecution: vi.fn(),
      getRecentExecutions: vi.fn(),
      getStepPrompt: vi.fn(),
      exportTemplate: vi.fn(),
      importTemplate: vi.fn(),
      cleanupOldExecutions: vi.fn(),
    }

    vi.mocked(WorkflowTemplateManager).mockImplementation(() => mockManager)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()
  })

  describe('help command', () => {
    it('should display help when no command provided', async () => {
      await handleWorkflowCommand([])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow Templates'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'))
    })

    it('should display help for help command', async () => {
      await handleWorkflowCommand(['help'])

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow Templates'))
    })
  })

  describe('list command', () => {
    it('should list all templates grouped by category', async () => {
      const mockTemplates = [
        {
          id: 'test-template',
          name: 'Test Template',
          description: 'A test template',
          category: 'testing',
          tags: ['test', 'unit'],
        },
        {
          id: 'dev-template',
          name: 'Dev Template',
          description: 'A development template',
          category: 'development',
          tags: ['dev'],
        },
      ]

      mockManager.getTemplates.mockReturnValue(mockTemplates)

      await handleWorkflowCommand(['list'])

      expect(mockManager.getTemplates).toHaveBeenCalledWith(undefined)
      expect(consoleLogSpy).toHaveBeenCalledWith('TESTING:')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('test-template'))
      expect(consoleLogSpy).toHaveBeenCalledWith('DEVELOPMENT:')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('dev-template'))
    })

    it('should list templates filtered by category', async () => {
      const mockTemplates = [
        {
          id: 'test-template',
          name: 'Test Template',
          description: 'A test template',
          category: 'testing',
          tags: ['test'],
        },
      ]

      mockManager.getTemplates.mockReturnValue(mockTemplates)

      await handleWorkflowCommand(['list', 'testing'])

      expect(mockManager.getTemplates).toHaveBeenCalledWith('testing')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Templates in category 'testing'"),
      )
    })

    it('should handle empty template list', async () => {
      mockManager.getTemplates.mockReturnValue([])

      await handleWorkflowCommand(['list'])

      expect(consoleLogSpy).toHaveBeenCalledWith('No templates found.')
    })
  })

  describe('search command', () => {
    it('should search templates', async () => {
      const mockResults = [
        {
          id: 'add-tests',
          name: 'Add Unit Tests',
          description: 'Add comprehensive unit tests',
          category: 'testing',
          tags: ['test', 'unit'],
        },
      ]

      mockManager.searchTemplates.mockReturnValue(mockResults)

      await handleWorkflowCommand(['search', 'unit', 'test'])

      expect(mockManager.searchTemplates).toHaveBeenCalledWith('unit test')
      expect(consoleLogSpy).toHaveBeenCalledWith('\nFound 1 template(s) matching "unit test":\n')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('add-tests'))
    })

    it('should handle no search results', async () => {
      mockManager.searchTemplates.mockReturnValue([])

      await handleWorkflowCommand(['search', 'nonexistent'])

      expect(consoleLogSpy).toHaveBeenCalledWith('No templates found matching: nonexistent')
    })

    it('should require search query', async () => {
      await expect(handleWorkflowCommand(['search'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Search query required')
    })
  })

  describe('show command', () => {
    it('should show template details', async () => {
      const mockTemplate = {
        id: 'test-template',
        name: 'Test Template',
        description: 'A test template',
        category: 'testing',
        tags: ['test'],
        author: 'Test Author',
        version: '1.0.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        prerequisites: ['Node.js installed'],
        steps: [
          {
            name: 'Step 1',
            description: 'First step',
            prompt: 'Do something',
            requiresConfirmation: true,
            expectedFiles: ['output.js'],
            successCriteria: ['File created'],
          },
        ],
        variables: {
          testVar: {
            description: 'Test variable',
            required: true,
            default: 'default',
            pattern: '^[a-z]+$',
          },
        },
      }

      mockManager.getTemplate.mockReturnValue(mockTemplate)

      await handleWorkflowCommand(['show', 'test-template'])

      expect(mockManager.getTemplate).toHaveBeenCalledWith('test-template')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Template: Test Template'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Author: Test Author'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Prerequisites:'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Variables:'))
    })

    it('should handle template not found', async () => {
      mockManager.getTemplate.mockReturnValue(null)

      await expect(handleWorkflowCommand(['show', 'nonexistent'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Template 'nonexistent' not found")
    })

    it('should require template ID', async () => {
      await expect(handleWorkflowCommand(['show'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Template ID required')
    })
  })

  describe('run command', () => {
    const mockTemplate = {
      id: 'test-template',
      name: 'Test Template',
      description: 'A test template',
      steps: [
        {
          name: 'Step 1',
          description: 'First step',
          prompt: 'Do {{action}} on {{target}}',
          requiresConfirmation: true,
          expectedFiles: ['{{output}}'],
          successCriteria: ['Success'],
        },
      ],
      variables: {
        action: {
          description: 'Action to perform',
          required: true,
        },
        target: {
          description: 'Target file',
          default: 'default.js',
        },
        output: {
          description: 'Output file',
          required: false,
        },
      },
      prerequisites: ['Test prerequisite'],
    }

    it('should run workflow with interactive prompts', async () => {
      mockManager.getTemplate.mockReturnValue(mockTemplate)

      // Mock readline responses
      let questionCount = 0
      mockReadline.question.mockImplementation((question: string, callback: Function) => {
        if (question.includes('Action to perform')) {
          callback('test-action')
        } else if (question.includes('Target file')) {
          callback('') // Use default
        } else if (question.includes('Output file')) {
          callback('output.js')
        }
        questionCount++
      })

      mockManager.startExecution.mockReturnValue({
        id: 'exec-123',
        templateId: 'test-template',
        templateName: 'Test Template',
        status: 'running',
        currentStep: 0,
        totalSteps: 1,
        variables: {
          action: 'test-action',
          target: 'default.js',
          output: 'output.js',
        },
        results: [{ stepIndex: 0, stepName: 'Step 1', status: 'running' }],
      })

      mockManager.getStepPrompt.mockReturnValue('Do test-action on default.js')

      await handleWorkflowCommand(['run', 'test-template'])

      expect(mockReadline.question).toHaveBeenCalled()
      expect(mockManager.startExecution).toHaveBeenCalledWith('test-template', {
        action: 'test-action',
        target: 'default.js',
        output: 'output.js',
      })
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Running Workflow: Test Template'),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Execution ID: exec-123'))
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Do test-action on default.js'),
      )
    })

    it('should handle command line variables', async () => {
      mockManager.getTemplate.mockReturnValue({
        ...mockTemplate,
        variables: {
          action: { description: 'Action', required: true },
        },
      })

      mockManager.startExecution.mockReturnValue({
        id: 'exec-124',
        status: 'running',
        currentStep: 0,
        totalSteps: 1,
        variables: { action: 'cli-action' },
        results: [],
      })

      mockManager.getStepPrompt.mockReturnValue('Do cli-action on target')

      await handleWorkflowCommand(['run', 'test-template', '--action', 'cli-action'])

      expect(mockReadline.question).not.toHaveBeenCalled() // Should skip prompting
      expect(mockManager.startExecution).toHaveBeenCalledWith('test-template', {
        action: 'cli-action',
      })
    })

    it('should validate required variables', async () => {
      mockManager.getTemplate.mockReturnValue(mockTemplate)

      // Mock empty response for required field
      mockReadline.question.mockImplementation((question: string, callback: Function) => {
        callback('') // Empty response
      })

      // This will keep prompting, so we need to limit it
      let callCount = 0
      mockReadline.question.mockImplementation((question: string, callback: Function) => {
        callCount++
        if (callCount > 5) {
          // Eventually provide a value to avoid infinite loop
          callback('forced-value')
        } else {
          callback('')
        }
      })

      mockManager.startExecution.mockReturnValue({
        id: 'exec-125',
        status: 'running',
        currentStep: 0,
        totalSteps: 1,
        variables: {},
        results: [],
      })

      await handleWorkflowCommand(['run', 'test-template'])

      expect(consoleLogSpy).toHaveBeenCalledWith('This field is required.')
    })

    it('should handle template not found', async () => {
      mockManager.getTemplate.mockReturnValue(null)

      await expect(handleWorkflowCommand(['run', 'nonexistent'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Template 'nonexistent' not found")
    })
  })

  describe('create command', () => {
    it('should create template interactively', async () => {
      let questionIndex = 0
      const responses = [
        'My Template', // name
        'Template description', // description
        'custom', // category
        'tag1, tag2', // tags
        'Author Name', // author
        'Step 1', // step 1 name
        'Step 1 description', // step 1 description
        'Do something', // step 1 prompt
        'y', // requires confirmation
        'output.js', // expected files
        'File created', // success criteria
        'n', // add another step
        'y', // define variables
        'myVar', // variable name
        'My variable', // variable description
        'default value', // default value
        'n', // required
        '^[a-z]+$', // pattern
        'n', // add another variable
        'Prerequisite 1', // prerequisites
      ]

      mockReadline.question.mockImplementation((question: string, callback: Function) => {
        callback(responses[questionIndex++] || '')
      })

      mockManager.createTemplate.mockReturnValue({
        id: 'my-template',
        name: 'My Template',
      })

      await handleWorkflowCommand(['create'])

      expect(mockManager.createTemplate).toHaveBeenCalledWith({
        name: 'My Template',
        description: 'Template description',
        category: 'custom',
        tags: ['tag1', 'tag2'],
        author: 'Author Name',
        steps: [
          {
            name: 'Step 1',
            description: 'Step 1 description',
            prompt: 'Do something',
            requiresConfirmation: true,
            expectedFiles: ['output.js'],
            successCriteria: ['File created'],
          },
        ],
        variables: {
          myVar: {
            description: 'My variable',
            default: 'default value',
            required: false,
            pattern: '^[a-z]+$',
          },
        },
        prerequisites: ['Prerequisite 1'],
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template created successfully'),
      )
    })
  })

  describe('delete command', () => {
    it('should delete template', async () => {
      mockManager.deleteTemplate.mockReturnValue(true)

      await handleWorkflowCommand(['delete', 'custom-template'])

      expect(mockManager.deleteTemplate).toHaveBeenCalledWith('custom-template')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "✓ Template 'custom-template' deleted successfully",
      )
    })

    it('should handle delete errors', async () => {
      mockManager.deleteTemplate.mockImplementation(() => {
        throw new Error('Cannot delete built-in templates')
      })

      await expect(handleWorkflowCommand(['delete', 'add-tests'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Cannot delete built-in templates')
    })
  })

  describe('export command', () => {
    it('should export template', async () => {
      mockManager.exportTemplate.mockReturnValue('id: test-template\nname: Test')

      await handleWorkflowCommand(['export', 'test-template', 'output.yaml'])

      expect(mockManager.exportTemplate).toHaveBeenCalledWith('test-template')
      expect(fs.writeFileSync).toHaveBeenCalledWith('output.yaml', 'id: test-template\nname: Test')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Template exported to: output.yaml')
    })

    it('should require template ID and output file', async () => {
      await expect(handleWorkflowCommand(['export', 'test-template'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Template ID and output file required')
    })
  })

  describe('import command', () => {
    it('should import template from file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('id: imported\nname: Imported Template')

      mockManager.importTemplate.mockReturnValue({
        id: 'imported-template',
        name: 'Imported Template',
      })

      await handleWorkflowCommand(['import', 'template.yaml'])

      expect(mockManager.importTemplate).toHaveBeenCalledWith(
        'id: imported\nname: Imported Template',
      )
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Template imported successfully!')
      expect(consoleLogSpy).toHaveBeenCalledWith('  ID: imported-template')
    })

    it('should handle missing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      await expect(handleWorkflowCommand(['import', 'missing.yaml'])).rejects.toThrow(
        'process.exit',
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error: File not found: missing.yaml')
    })
  })

  describe('history command', () => {
    it('should show recent executions', async () => {
      const mockExecutions = [
        {
          id: 'exec-123',
          templateId: 'test-template',
          templateName: 'Test Template',
          status: 'completed',
          currentStep: 3,
          totalSteps: 3,
          startTime: new Date(Date.now() - 3600000).toISOString(),
          endTime: new Date().toISOString(),
        },
      ]

      mockManager.getRecentExecutions.mockReturnValue(mockExecutions)

      await handleWorkflowCommand(['history'])

      expect(mockManager.getRecentExecutions).toHaveBeenCalledWith(10)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Recent Workflow Executions'),
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('exec-123'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Duration: 3600s'))
    })

    it('should handle custom limit', async () => {
      mockManager.getRecentExecutions.mockReturnValue([])

      await handleWorkflowCommand(['history', '20'])

      expect(mockManager.getRecentExecutions).toHaveBeenCalledWith(20)
    })
  })

  describe('status command', () => {
    it('should show execution status', async () => {
      const mockExecution = {
        id: 'exec-123',
        templateId: 'test-template',
        templateName: 'Test Template',
        status: 'running',
        currentStep: 1,
        totalSteps: 3,
        startTime: new Date().toISOString(),
        variables: { test: 'value' },
        results: [
          {
            stepIndex: 0,
            stepName: 'Step 1',
            status: 'completed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
          },
          {
            stepIndex: 1,
            stepName: 'Step 2',
            status: 'running',
            startTime: new Date().toISOString(),
          },
          {
            stepIndex: 2,
            stepName: 'Step 3',
            status: 'pending',
          },
        ],
      }

      mockManager.getExecution.mockReturnValue(mockExecution)

      await handleWorkflowCommand(['status', 'exec-123'])

      expect(mockManager.getExecution).toHaveBeenCalledWith('exec-123')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Execution Status'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('✓ 1. Step 1 - completed'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('⟳ 2. Step 2 - running'))
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('○ 3. Step 3 - pending'))
    })

    it('should handle execution not found', async () => {
      mockManager.getExecution.mockReturnValue(null)

      await expect(handleWorkflowCommand(['status', 'nonexistent'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error: Execution 'nonexistent' not found")
    })
  })

  describe('cleanup command', () => {
    it('should cleanup old executions', async () => {
      mockManager.cleanupOldExecutions.mockReturnValue(5)

      await handleWorkflowCommand(['cleanup'])

      expect(mockManager.cleanupOldExecutions).toHaveBeenCalledWith(30)
      expect(consoleLogSpy).toHaveBeenCalledWith('Cleaning up executions older than 30 days...')
      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Deleted 5 old execution(s)')
    })

    it('should handle custom days', async () => {
      mockManager.cleanupOldExecutions.mockReturnValue(3)

      await handleWorkflowCommand(['cleanup', '60'])

      expect(mockManager.cleanupOldExecutions).toHaveBeenCalledWith(60)
      expect(consoleLogSpy).toHaveBeenCalledWith('Cleaning up executions older than 60 days...')
    })
  })

  describe('unknown command', () => {
    it('should show error for unknown command', async () => {
      await expect(handleWorkflowCommand(['unknown'])).rejects.toThrow('process.exit')

      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown command: unknown')
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Workflow Templates'))
    })
  })
})
