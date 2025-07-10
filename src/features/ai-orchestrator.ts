import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { AIProvider, getProvider, getProviderCommand } from '../config/ai-providers.js'

interface OrchestrationConfig {
  driverProvider: string
  workerProvider: string
  task: string
  maxIterations?: number
  timeout?: number
}

interface AIResponse {
  content: string
  hasQuestion: boolean
  hasError: boolean
  needsClarification: boolean
}

export class AIOrchestrator extends EventEmitter {
  private driverProcess: ChildProcess | null = null
  private workerProcess: ChildProcess | null = null
  private iterationCount = 0
  private driverBuffer = ''
  private workerBuffer = ''

  async orchestrate(config: OrchestrationConfig): Promise<void> {
    const maxIterations = config.maxIterations || 10
    
    // Start the worker AI with the task
    await this.startWorker(config.workerProvider, config.task)
    
    // Start the driver AI in assistant mode
    await this.startDriver(config.driverProvider)
    
    // Set up the orchestration loop
    this.setupOrchestration(maxIterations)
  }

  private async startWorker(provider: string, task: string): Promise<void> {
    const command = getProviderCommand(provider)
    if (!command) {
      throw new Error(`Worker provider ${provider} not available`)
    }

    this.workerProcess = spawn(command, [task], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    this.workerProcess.stdout?.on('data', (data) => {
      this.handleWorkerOutput(data.toString())
    })

    this.workerProcess.on('error', (error) => {
      this.emit('error', { source: 'worker', error })
    })
  }

  private async startDriver(provider: string): Promise<void> {
    const command = getProviderCommand(provider)
    if (!command) {
      throw new Error(`Driver provider ${provider} not available`)
    }

    // Start driver in a mode where it can analyze and respond
    const driverPrompt = `You are an AI assistant helping another AI complete a task. 
    When the other AI asks questions or needs clarification, provide helpful responses.
    When you see errors or issues, provide corrections.
    Be concise and direct in your responses.`

    this.driverProcess = spawn(command, [driverPrompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    this.driverProcess.stdout?.on('data', (data) => {
      this.handleDriverOutput(data.toString())
    })

    this.driverProcess.on('error', (error) => {
      this.emit('error', { source: 'driver', error })
    })
  }

  private handleWorkerOutput(data: string): void {
    this.workerBuffer += data
    this.emit('worker-output', data)

    // Check if worker is asking a question or needs help
    if (this.needsDriverIntervention(data)) {
      this.iterationCount++
      
      if (this.iterationCount > 10) {
        this.emit('max-iterations-reached')
        this.cleanup()
        return
      }

      // Send to driver for analysis
      const prompt = `The AI assistant working on a task just said: "${data}"\n
      Please provide a helpful response or clarification.`
      
      this.driverProcess?.stdin?.write(prompt + '\n')
    }
  }

  private handleDriverOutput(data: string): void {
    this.driverBuffer += data
    this.emit('driver-output', data)

    // Send driver's response back to worker
    if (this.isCompleteResponse(data)) {
      this.workerProcess?.stdin?.write(data + '\n')
    }
  }

  private needsDriverIntervention(output: string): boolean {
    const indicators = [
      '?',
      'error',
      'Error',
      'failed',
      'Failed',
      'unclear',
      'clarify',
      'which',
      'what',
      'should I',
      'do you want',
      'please specify',
    ]

    return indicators.some(indicator => output.includes(indicator))
  }

  private isCompleteResponse(output: string): boolean {
    // Simple heuristic: response ends with punctuation and newline
    return /[.!?]\s*$/.test(output.trim())
  }

  private setupOrchestration(maxIterations: number): void {
    // Monitor for completion
    const checkCompletion = setInterval(() => {
      if (this.iterationCount >= maxIterations) {
        clearInterval(checkCompletion)
        this.emit('complete', {
          iterations: this.iterationCount,
          workerOutput: this.workerBuffer,
          driverOutput: this.driverBuffer,
        })
        this.cleanup()
      }
    }, 1000)
  }

  cleanup(): void {
    this.driverProcess?.kill()
    this.workerProcess?.kill()
    this.driverProcess = null
    this.workerProcess = null
  }
}

// Example usage function
export async function orchestrateAIs(
  task: string,
  driverProvider = 'gemini',
  workerProvider = 'claude-code'
): Promise<void> {
  const orchestrator = new AIOrchestrator()
  
  orchestrator.on('worker-output', (data) => {
    console.log(`[Worker]: ${data}`)
  })
  
  orchestrator.on('driver-output', (data) => {
    console.log(`[Driver]: ${data}`)
  })
  
  orchestrator.on('error', ({ source, error }) => {
    console.error(`[${source} Error]:`, error)
  })
  
  orchestrator.on('complete', (result) => {
    console.log('\n=== Orchestration Complete ===')
    console.log(`Iterations: ${result.iterations}`)
  })

  await orchestrator.orchestrate({
    driverProvider,
    workerProvider,
    task,
  })
}