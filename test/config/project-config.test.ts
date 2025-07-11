import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ConfigManager } from '../../src/config/manager'
import { CONFIG_PATHS } from '../../src/config/paths'

vi.mock('fs')
vi.mock('yaml', () => ({
  parse: (content: string) => {
    // Simple YAML parser for our test cases
    const result: any = {}
    const lines = content.trim().split('\n')
    let currentArray: string[] | null = null
    let currentKey: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (trimmed.startsWith('- ')) {
        // Array item
        if (currentArray && currentKey) {
          currentArray.push(trimmed.slice(2).trim())
        }
      } else if (trimmed.includes(':')) {
        // Key-value pair
        const [key, value] = trimmed.split(':').map((s) => s.trim())
        if (!value) {
          // Start of array
          currentKey = key
          currentArray = []
          result[key] = currentArray
        } else {
          // Simple value
          currentKey = null
          currentArray = null
          if (value === 'true') {
            result[key] = true
          } else if (value === 'false') {
            result[key] = false
          } else {
            result[key] = value
          }
        }
      }
    }

    return result
  },
}))

describe('Project Configuration', () => {
  let configManager: ConfigManager

  beforeEach(() => {
    vi.clearAllMocks()
    ConfigManager.resetInstance()

    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project')

    // Mock environment variable instead of os.homedir
    vi.stubEnv('CODA_CONFIG_DIR', '/home/test/.coda')

    configManager = ConfigManager.getInstance()

    // Mock fs.existsSync to return false by default
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should load project config when present', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === '/test/project/.coda/config.yaml'
    })

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === '/test/project/.coda/config.yaml') {
        return `
show_notifications: false
toolsets: ["test-toolset"]
`
      }
      throw new Error('File not found')
    })

    await configManager.loadConfig({ toolsetNames: [] })
    const config = configManager.getAppConfig()

    expect(config.show_notifications).toBe(false)
    expect(config.toolsets).toEqual(['test-toolset'])
  })

  it('should prioritize project config over global config', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === '/home/test/.coda/config.yaml' || path === '/test/project/.coda/config.yaml'
    })

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === '/home/test/.coda/config.yaml') {
        return `
show_notifications: true
toolsets:
  - global
`
      }
      if (path === '/test/project/.coda/config.yaml') {
        return `
show_notifications: false
yolo: true
`
      }
      throw new Error('File not found')
    })

    await configManager.loadConfig({ toolsetNames: [] })
    const config = configManager.getAppConfig()

    // Project values override global
    expect(config.show_notifications).toBe(false)
    expect(config.yolo).toBe(true)

    // Global value used when not in project
    expect(config.toolsets).toEqual(['global'])
  })

  it('should prioritize CLI overrides over project config', async () => {
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path === '/test/project/.coda/config.yaml'
    })

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === '/test/project/.coda/config.yaml') {
        return `
show_notifications: false
yolo: true
`
      }
      throw new Error('File not found')
    })

    await configManager.loadConfig({
      cliOverrides: {
        show_notifications: true,
      },
    })
    const config = configManager.getAppConfig()

    // CLI overrides project
    expect(config.show_notifications).toBe(true)

    // Project value used when no CLI override
    expect(config.yolo).toBe(true)
  })

  it('should handle toolsets with complete replacement at each level', async () => {
    // Mock toolset files to exist as well
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return (
        path === '/home/test/.coda/config.yaml' ||
        path === '/test/project/.coda/config.yaml' ||
        path.includes('/toolsets/')
      )
    })

    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === '/home/test/.coda/config.yaml') {
        return `
toolsets:
  - global-tool-1
  - global-tool-2
`
      }
      if (path === '/test/project/.coda/config.yaml') {
        return `
toolsets:
  - project-tool
`
      }
      // Return empty toolset config for any toolset file
      if (path.includes('/toolsets/')) {
        return `{}`
      }
      throw new Error('File not found')
    })

    // Test 1: Project replaces global (don't load toolsets to avoid complexity)
    await configManager.loadConfig({ toolsetNames: [] })
    let config = configManager.getAppConfig()
    expect(config.toolsets).toEqual(['project-tool'])

    // Test 2: CLI replaces everything
    ConfigManager.resetInstance()
    vi.stubEnv('CODA_CONFIG_DIR', '/home/test/.coda')
    configManager = ConfigManager.getInstance()
    await configManager.loadConfig({
      toolsetNames: [],
      cliOverrides: {
        toolsets: ['cli-tool'],
      },
    })
    config = configManager.getAppConfig()
    expect(config.toolsets).toEqual(['cli-tool'])
  })

  it('should work without any config files', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await configManager.loadConfig()
    const config = configManager.getAppConfig()

    // Should have defaults
    expect(config.show_notifications).toBe(true)
    expect(config.yolo).toBeUndefined()
    expect(config.toolsets).toBeUndefined()
  })
})
