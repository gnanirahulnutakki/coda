import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { WorkflowTemplateManager, WorkflowExecution } from '../features/workflow-templates.js'

function printHelp(): void {
  console.log(`
Workflow Templates - Reusable AI Task Patterns

Usage: coda workflow <command> [options]

Commands:
  list [category]              List available workflow templates
  search <query>               Search templates by name, description, or tags
  show <id>                    Show details of a specific template
  run <id>                     Run a workflow template
  create                       Create a new custom template (interactive)
  edit <id>                    Edit a custom template
  delete <id>                  Delete a custom template
  export <id> <file>           Export a template to file
  import <file>                Import a template from file
  history [limit]              Show recent workflow executions
  status <execution-id>        Show execution status
  cleanup [days]               Clean up old executions (default: 30 days)

Categories:
  development    - Code generation and feature development
  testing        - Test creation and quality assurance
  refactoring    - Code improvement and cleanup
  documentation  - Documentation generation and updates
  debugging      - Problem solving and troubleshooting
  security       - Security scanning and fixes
  custom         - User-created templates

Examples:
  coda workflow list testing
  coda workflow search "unit test"
  coda workflow run add-tests
  coda workflow show refactor-extract-function
  coda workflow export my-template workflow.yaml
`)
}

async function promptForVariables(
  variables: Record<
    string,
    { description: string; default?: string; required?: boolean; pattern?: string }
  >,
  providedVars: Record<string, string> = {},
): Promise<Record<string, string>> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve)
    })
  }

  const result: Record<string, string> = { ...providedVars }

  for (const [key, config] of Object.entries(variables)) {
    if (result[key]) continue // Already provided

    let question = `${config.description}`
    if (config.default) {
      question += ` [${config.default}]`
    }
    if (config.required) {
      question += ' (required)'
    }
    question += ': '

    let value = await prompt(question)

    // Use default if empty
    if (!value && config.default) {
      value = config.default
    }

    // Validate required
    while (config.required && !value) {
      console.log('This field is required.')
      value = await prompt(question)
    }

    // Validate pattern
    if (value && config.pattern) {
      const regex = new RegExp(config.pattern)
      while (!regex.test(value)) {
        console.log(`Value must match pattern: ${config.pattern}`)
        value = await prompt(question)
      }
    }

    if (value) {
      result[key] = value
    }
  }

  rl.close()
  return result
}

async function createTemplateInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const prompt = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve)
    })
  }

  console.log('\n--- Create New Workflow Template ---\n')

  // Basic information
  const name = await prompt('Template name: ')
  const description = await prompt('Description: ')
  const category =
    (await prompt(
      'Category (development/testing/refactoring/documentation/debugging/security/custom) [custom]: ',
    )) || 'custom'
  const tagsInput = await prompt('Tags (comma-separated): ')
  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t)
  const author = await prompt('Author name (optional): ')

  // Steps
  const steps: any[] = []
  let addMoreSteps = true
  let stepIndex = 1

  while (addMoreSteps) {
    console.log(`\n--- Step ${stepIndex} ---`)
    const stepName = await prompt('Step name: ')
    if (!stepName) break

    const stepDescription = await prompt('Step description (optional): ')
    const stepPrompt = await prompt('AI prompt for this step: ')
    const requiresConfirmation =
      (await prompt('Requires user confirmation? (y/n) [n]: ')).toLowerCase() === 'y'

    const step: any = {
      name: stepName,
      prompt: stepPrompt,
      requiresConfirmation,
    }

    if (stepDescription) {
      step.description = stepDescription
    }

    // Expected files
    const expectedFilesInput = await prompt('Expected output files (comma-separated, optional): ')
    if (expectedFilesInput) {
      step.expectedFiles = expectedFilesInput
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f)
    }

    // Success criteria
    const successCriteriaInput = await prompt('Success criteria (comma-separated, optional): ')
    if (successCriteriaInput) {
      step.successCriteria = successCriteriaInput
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c)
    }

    steps.push(step)
    stepIndex++

    addMoreSteps = (await prompt('\nAdd another step? (y/n) [y]: ')).toLowerCase() !== 'n'
  }

  // Variables
  const variables: Record<string, any> = {}
  const addVariables =
    (await prompt('\nDefine template variables? (y/n) [n]: ')).toLowerCase() === 'y'

  if (addVariables) {
    let addMoreVars = true
    while (addMoreVars) {
      const varName = await prompt('\nVariable name (e.g., targetFile): ')
      if (!varName) break

      const varDescription = await prompt('Description: ')
      const varDefault = await prompt('Default value (optional): ')
      const varRequired = (await prompt('Required? (y/n) [y]: ')).toLowerCase() !== 'n'
      const varPattern = await prompt('Validation pattern (regex, optional): ')

      variables[varName] = {
        description: varDescription,
        required: varRequired,
      }

      if (varDefault) variables[varName].default = varDefault
      if (varPattern) variables[varName].pattern = varPattern

      addMoreVars = (await prompt('\nAdd another variable? (y/n) [n]: ')).toLowerCase() === 'y'
    }
  }

  // Prerequisites
  const prerequisitesInput = await prompt('\nPrerequisites (comma-separated, optional): ')
  const prerequisites = prerequisitesInput
    ? prerequisitesInput
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p)
    : undefined

  rl.close()

  // Create the template
  try {
    const manager = new WorkflowTemplateManager()
    const template = manager.createTemplate({
      name,
      description,
      category: category as any,
      tags,
      steps,
      variables: Object.keys(variables).length > 0 ? variables : undefined,
      prerequisites,
      author: author || undefined,
    })

    console.log(`\n✓ Template created successfully!`)
    console.log(`  ID: ${template.id}`)
    console.log(`  File: ~/.coda/workflows/templates/${template.id}.yaml`)
  } catch (error) {
    console.error(`\nError creating template: ${error.message}`)
    process.exit(1)
  }
}

async function runWorkflow(templateId: string, args: string[]): Promise<void> {
  const manager = new WorkflowTemplateManager()
  const template = manager.getTemplate(templateId)

  if (!template) {
    console.error(`Error: Template '${templateId}' not found`)
    console.log('\nUse "coda workflow list" to see available templates')
    process.exit(1)
  }

  console.log(`\n--- Running Workflow: ${template.name} ---`)
  console.log(`Description: ${template.description}`)

  if (template.prerequisites && template.prerequisites.length > 0) {
    console.log('\nPrerequisites:')
    template.prerequisites.forEach((p) => console.log(`  - ${p}`))
  }

  console.log(`\nSteps (${template.steps.length}):`)
  template.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.name}`)
    if (step.description) {
      console.log(`     ${step.description}`)
    }
  })

  // Parse provided variables from args
  const providedVars: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].substring(2)
      providedVars[key] = args[i + 1]
      i++ // Skip next arg
    }
  }

  // Collect variables
  let variables: Record<string, string> = {}
  if (template.variables && Object.keys(template.variables).length > 0) {
    console.log('\n--- Variable Configuration ---')
    variables = await promptForVariables(template.variables, providedVars)
  }

  // Start execution
  console.log('\n--- Starting Execution ---')

  try {
    const execution = await manager.startExecution(templateId, variables)
    console.log(`Execution ID: ${execution.id}`)
    console.log(`Status: ${execution.status}`)
    console.log(`Current step: ${execution.currentStep + 1}/${execution.totalSteps}`)

    // Display the first step
    console.log('\n--- Step 1: ' + template.steps[0].name + ' ---')
    if (template.steps[0].description) {
      console.log(template.steps[0].description)
    }

    const prompt = manager.getStepPrompt(templateId, 0, variables)
    console.log('\nPrompt for AI:')
    console.log('---')
    console.log(prompt)
    console.log('---')

    if (template.steps[0].requiresConfirmation) {
      console.log('\n⚠️  This step requires confirmation before proceeding.')
    }

    if (template.steps[0].expectedFiles) {
      console.log('\nExpected files:')
      template.steps[0].expectedFiles.forEach((f) => {
        const interpolated = f.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '')
        console.log(`  - ${interpolated}`)
      })
    }

    if (template.steps[0].successCriteria) {
      console.log('\nSuccess criteria:')
      template.steps[0].successCriteria.forEach((c) => console.log(`  ✓ ${c}`))
    }

    console.log('\n💡 To continue with the next step, run:')
    console.log(`   coda workflow continue ${execution.id}`)

    console.log('\n📋 To view execution status:')
    console.log(`   coda workflow status ${execution.id}`)
  } catch (error) {
    console.error(`\nError starting workflow: ${error.message}`)
    process.exit(1)
  }
}

export async function handleWorkflowCommand(args: string[]): Promise<void> {
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const manager = new WorkflowTemplateManager()

  try {
    switch (command) {
      case 'list': {
        const category = args[1] as any
        const templates = manager.getTemplates(category)

        if (templates.length === 0) {
          console.log(
            category ? `No templates found in category: ${category}` : 'No templates found.',
          )
          return
        }

        console.log(
          category ? `\nTemplates in category '${category}':\n` : '\nAvailable Templates:\n',
        )

        // Group by category if not filtered
        if (!category) {
          const grouped = templates.reduce(
            (acc, t) => {
              if (!acc[t.category]) acc[t.category] = []
              acc[t.category].push(t)
              return acc
            },
            {} as Record<string, typeof templates>,
          )

          for (const [cat, catTemplates] of Object.entries(grouped)) {
            console.log(`${cat.toUpperCase()}:`)
            catTemplates.forEach((t) => {
              console.log(`  ${t.id.padEnd(25)} ${t.name}`)
              console.log(`  ${' '.repeat(25)} ${t.description}`)
              if (t.tags.length > 0) {
                console.log(`  ${' '.repeat(25)} Tags: ${t.tags.join(', ')}`)
              }
              console.log()
            })
          }
        } else {
          templates.forEach((t) => {
            console.log(`${t.id.padEnd(25)} ${t.name}`)
            console.log(`${' '.repeat(25)} ${t.description}`)
            if (t.tags.length > 0) {
              console.log(`${' '.repeat(25)} Tags: ${t.tags.join(', ')}`)
            }
            console.log()
          })
        }
        break
      }

      case 'search': {
        const query = args.slice(1).join(' ')
        if (!query) {
          console.error('Error: Search query required')
          console.log('Usage: coda workflow search <query>')
          process.exit(1)
        }

        const results = manager.searchTemplates(query)

        if (results.length === 0) {
          console.log(`No templates found matching: ${query}`)
          return
        }

        console.log(`\nFound ${results.length} template(s) matching "${query}":\n`)

        results.forEach((t) => {
          console.log(`${t.id.padEnd(25)} ${t.name}`)
          console.log(`${' '.repeat(25)} ${t.description}`)
          console.log(`${' '.repeat(25)} Category: ${t.category} | Tags: ${t.tags.join(', ')}`)
          console.log()
        })
        break
      }

      case 'show': {
        const templateId = args[1]
        if (!templateId) {
          console.error('Error: Template ID required')
          console.log('Usage: coda workflow show <id>')
          process.exit(1)
        }

        const template = manager.getTemplate(templateId)
        if (!template) {
          console.error(`Error: Template '${templateId}' not found`)
          process.exit(1)
        }

        console.log(`\n--- Template: ${template.name} ---`)
        console.log(`ID: ${template.id}`)
        console.log(`Description: ${template.description}`)
        console.log(`Category: ${template.category}`)
        console.log(`Tags: ${template.tags.join(', ')}`)
        if (template.author) console.log(`Author: ${template.author}`)
        if (template.version) console.log(`Version: ${template.version}`)
        console.log(`Created: ${new Date(template.created).toLocaleString()}`)
        console.log(`Updated: ${new Date(template.updated).toLocaleString()}`)

        if (template.prerequisites && template.prerequisites.length > 0) {
          console.log('\nPrerequisites:')
          template.prerequisites.forEach((p) => console.log(`  - ${p}`))
        }

        console.log(`\nSteps (${template.steps.length}):`)
        template.steps.forEach((step, i) => {
          console.log(`\n${i + 1}. ${step.name}`)
          if (step.description) console.log(`   ${step.description}`)
          console.log(`   Prompt: ${step.prompt.substring(0, 100)}...`)
          if (step.requiresConfirmation) console.log(`   ⚠️  Requires confirmation`)
          if (step.expectedFiles) console.log(`   Expected files: ${step.expectedFiles.join(', ')}`)
          if (step.successCriteria)
            console.log(`   Success criteria: ${step.successCriteria.length} items`)
        })

        if (template.variables && Object.keys(template.variables).length > 0) {
          console.log('\nVariables:')
          for (const [key, config] of Object.entries(template.variables)) {
            console.log(`  ${key}:`)
            console.log(`    Description: ${config.description}`)
            if (config.required) console.log(`    Required: yes`)
            if (config.default) console.log(`    Default: ${config.default}`)
            if (config.pattern) console.log(`    Pattern: ${config.pattern}`)
          }
        }
        break
      }

      case 'run': {
        const templateId = args[1]
        if (!templateId) {
          console.error('Error: Template ID required')
          console.log('Usage: coda workflow run <id> [--var value ...]')
          process.exit(1)
        }

        await runWorkflow(templateId, args.slice(2))
        break
      }

      case 'create': {
        await createTemplateInteractive()
        break
      }

      case 'edit': {
        const templateId = args[1]
        if (!templateId) {
          console.error('Error: Template ID required')
          console.log('Usage: coda workflow edit <id>')
          process.exit(1)
        }

        const template = manager.getTemplate(templateId)
        if (!template) {
          console.error(`Error: Template '${templateId}' not found`)
          process.exit(1)
        }

        // Check if built-in
        if (
          [
            'add-tests',
            'refactor-extract-function',
            'api-endpoint',
            'fix-security-issues',
            'debug-issue',
          ].includes(templateId)
        ) {
          console.error('Error: Cannot edit built-in templates')
          console.log('Tip: You can export it and import as a new custom template')
          process.exit(1)
        }

        console.log('Template editing is not yet implemented in CLI.')
        console.log('Please edit the YAML file directly:')
        console.log(`  ~/.coda/workflows/templates/${templateId}.yaml`)
        break
      }

      case 'delete': {
        const templateId = args[1]
        if (!templateId) {
          console.error('Error: Template ID required')
          console.log('Usage: coda workflow delete <id>')
          process.exit(1)
        }

        try {
          const success = manager.deleteTemplate(templateId)
          if (success) {
            console.log(`✓ Template '${templateId}' deleted successfully`)
          } else {
            console.error(`Error: Template '${templateId}' not found`)
            process.exit(1)
          }
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'export': {
        const templateId = args[1]
        const outputFile = args[2]

        if (!templateId || !outputFile) {
          console.error('Error: Template ID and output file required')
          console.log('Usage: coda workflow export <id> <file>')
          process.exit(1)
        }

        try {
          const yamlContent = manager.exportTemplate(templateId)
          fs.writeFileSync(outputFile, yamlContent)
          console.log(`✓ Template exported to: ${outputFile}`)
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'import': {
        const inputFile = args[1]
        if (!inputFile) {
          console.error('Error: Input file required')
          console.log('Usage: coda workflow import <file>')
          process.exit(1)
        }

        if (!fs.existsSync(inputFile)) {
          console.error(`Error: File not found: ${inputFile}`)
          process.exit(1)
        }

        try {
          const yamlContent = fs.readFileSync(inputFile, 'utf8')
          const template = manager.importTemplate(yamlContent)
          console.log(`✓ Template imported successfully!`)
          console.log(`  ID: ${template.id}`)
          console.log(`  Name: ${template.name}`)
        } catch (error) {
          console.error(`Error: ${error.message}`)
          process.exit(1)
        }
        break
      }

      case 'history': {
        const limit = parseInt(args[1]) || 10
        const executions = manager.getRecentExecutions(limit)

        if (executions.length === 0) {
          console.log('No recent executions found.')
          return
        }

        console.log(`\nRecent Workflow Executions (${executions.length}):\n`)

        executions.forEach((exec) => {
          const duration = exec.endTime
            ? `${Math.round((new Date(exec.endTime).getTime() - new Date(exec.startTime).getTime()) / 1000)}s`
            : 'ongoing'

          console.log(`${exec.id}`)
          console.log(`  Template: ${exec.templateName} (${exec.templateId})`)
          console.log(`  Status: ${exec.status}`)
          console.log(`  Progress: ${exec.currentStep}/${exec.totalSteps} steps`)
          console.log(`  Started: ${new Date(exec.startTime).toLocaleString()}`)
          console.log(`  Duration: ${duration}`)
          console.log()
        })
        break
      }

      case 'status': {
        const executionId = args[1]
        if (!executionId) {
          console.error('Error: Execution ID required')
          console.log('Usage: coda workflow status <execution-id>')
          process.exit(1)
        }

        const execution = manager.getExecution(executionId)
        if (!execution) {
          console.error(`Error: Execution '${executionId}' not found`)
          process.exit(1)
        }

        console.log(`\n--- Execution Status ---`)
        console.log(`ID: ${execution.id}`)
        console.log(`Template: ${execution.templateName} (${execution.templateId})`)
        console.log(`Status: ${execution.status}`)
        console.log(`Progress: ${execution.currentStep}/${execution.totalSteps} steps`)
        console.log(`Started: ${new Date(execution.startTime).toLocaleString()}`)

        if (execution.endTime) {
          console.log(`Ended: ${new Date(execution.endTime).toLocaleString()}`)
          const duration = Math.round(
            (new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) /
              1000,
          )
          console.log(`Duration: ${duration} seconds`)
        }

        if (Object.keys(execution.variables).length > 0) {
          console.log('\nVariables:')
          for (const [key, value] of Object.entries(execution.variables)) {
            console.log(`  ${key}: ${value}`)
          }
        }

        console.log('\nStep Results:')
        execution.results.forEach((result, i) => {
          const icon =
            result.status === 'completed'
              ? '✓'
              : result.status === 'failed'
                ? '✗'
                : result.status === 'running'
                  ? '⟳'
                  : '○'

          console.log(`  ${icon} ${i + 1}. ${result.stepName} - ${result.status}`)

          if (result.startTime) {
            console.log(`     Started: ${new Date(result.startTime).toLocaleString()}`)
          }

          if (result.endTime) {
            console.log(`     Ended: ${new Date(result.endTime).toLocaleString()}`)
          }

          if (result.error) {
            console.log(`     Error: ${result.error}`)
          }
        })
        break
      }

      case 'cleanup': {
        const days = parseInt(args[1]) || 30
        console.log(`Cleaning up executions older than ${days} days...`)

        const deletedCount = manager.cleanupOldExecutions(days)
        console.log(`✓ Deleted ${deletedCount} old execution(s)`)
        break
      }

      case 'continue': {
        const executionId = args[1]
        if (!executionId) {
          console.error('Error: Execution ID required')
          console.log('Usage: coda workflow continue <execution-id>')
          process.exit(1)
        }

        console.log('Workflow continuation is not yet implemented.')
        console.log('This feature will allow stepping through multi-step workflows.')
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
