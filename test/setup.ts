import { vi, beforeAll, afterEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'

// Mock CONFIG_PATHS to use temp directories during tests
vi.mock('../src/config/paths', () => {
  const testConfigDir = path.join(os.tmpdir(), 'coda-test-config')
  return {
    CONFIG_PATHS: {
      getConfigDirectory: () => testConfigDir,
      getLogsDirectory: () => path.join(testConfigDir, 'logs'),
      getBackupsDirectory: () => path.join(testConfigDir, 'backups'),
      getToolsetsDirectory: () => path.join(testConfigDir, 'toolsets'),
      getRulesetsDirectory: () => path.join(testConfigDir, 'rulesets'),
      getPatternsDirectory: () => path.join(testConfigDir, 'patterns'),
      getConfigFilePath: () => path.join(testConfigDir, 'config.yaml'),
      getProjectConfigFilePath: () => path.join(process.cwd(), '.coda', 'config.yaml'),
    },
    ENV_VARS: {
      CONFIG_DIR: 'CODA_CONFIG_DIR',
      APP_PATH: 'CLAUDE_APP_PATH',
      PATTERNS_PATH: 'CLAUDE_PATTERNS_PATH',
      HOME: 'HOME',
      PWD: 'PWD',
      FORCE_COLOR: 'FORCE_COLOR',
      TERM: 'TERM',
      MOCK_ENV: 'MOCK_ENV',
    },
    AI_PROVIDER_PATHS: {
      claude: {
        getDefaultAppPath: () => path.join(os.homedir(), '.claude', 'local', 'claude'),
        getDefaultCliPath: () => path.join(os.homedir(), '.claude', 'local', 'node_modules', '@anthropic-ai', 'claude-cli', 'cli.js'),
      },
      findProviderCommand: () => 'mocked-provider-command',
    },
    CLAUDE_PATHS: {
      getDefaultAppPath: () => path.join(os.homedir(), '.claude', 'local', 'claude'),
      getDefaultCliPath: () => path.join(os.homedir(), '.claude', 'local', 'node_modules', '@anthropic-ai', 'claude-cli', 'cli.js'),
    },
  }
})

// Mock error logger to prevent file operations during tests
vi.mock('../src/utils/error-logger', () => {
  const mockLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    setDebugMode: vi.fn(),
    setLogLevel: vi.fn(),
  }
  
  return {
    errorLogger: mockLogger,
    LogLevel: {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
    }
  }
})

// Mock notifications to prevent UI operations during tests
vi.mock('../src/utils/notifications', () => ({
  showNotification: vi.fn().mockResolvedValue(undefined),
  showPatternNotification: vi.fn().mockResolvedValue(undefined),
}))

// Set test environment variable
process.env.NODE_ENV = 'test'
process.env.CI = 'true'

// Clear all mocks after each test
afterEach(() => {
  vi.clearAllMocks()
})