import * as os from 'os'
import * as path from 'path'
import type {
  PreflightOptions,
  PreflightResult,
  AppConfig,
} from '../types/preflight.js'
import {
  ensureConfigDirectory,
  loadConfigFile,
  createTempMcpConfig,
} from '../config/loader.js'
import { buildToolsetArgs, mergeToolsets } from '../config/toolsets.js'
import {
  checkGitInstalled,
  checkChildAppPath,
  checkVersionControl,
  checkDirtyDirectory,
  handleAutomaticAcceptanceWarning,
} from '../safety/checker.js'
import { CLAUDE_PATHS } from '../config/paths.js'
import { parseCommandLineArgs, buildKnownOptionsSet } from '../cli/parser.js'
import { detectSubcommand } from '../cli/subcommand.js'
import { log, warn, setQuietMode, clearScreen } from '../utils/logging.js'
import { errorLogger } from '../utils/error-logger.js'

export async function runPreflight(
  argv: string[],
  options?: PreflightOptions,
): Promise<PreflightResult> {
  let appConfig: AppConfig = {
    show_notifications: true,
    dangerously_allow_in_dirty_directory: false,
    dangerously_allow_without_version_control: false,
  }

  ensureConfigDirectory()

  const {
    program,
    options: parsedOptions,
    args,
    helpRequested,
    versionRequested,
    hasPrintOption,
  } = parseCommandLineArgs(argv)

  const knownOptions = buildKnownOptionsSet(program)

  if (parsedOptions.quiet) {
    setQuietMode(true)
  }
  
  if (parsedOptions.debug) {
    errorLogger.setDebugMode(true)
    log('※ Debug mode enabled - verbose logging active')
  }

  const isHelp = helpRequested
  const isVersion = versionRequested
  const isPrint = hasPrintOption
  const subcommandResult = detectSubcommand(args)
  const isSubcommand = subcommandResult.isSubcommand

  if (isHelp || isVersion) {
    return {
      appConfig,
      toolsetArgs: [],
      childArgs: [],
      shouldExit: true,
      exitCode: 0,
      knownOptions,
      hasPrintOption,
    }
  }

  const ignoreGlobalConfig =
    parsedOptions.ignoreGlobalConfig ||
    options?.ignoreGlobalConfig ||
    argv.includes('--ignore-global-config')

  // Check for config file existence first, before doing other checks
  if (!ignoreGlobalConfig && !isPrint && !isSubcommand) {
    const { CONFIG_PATHS } = await import('../config/paths.js')
    const configPath = options?.configPath || CONFIG_PATHS.getConfigFilePath()
    const projectConfigPath = CONFIG_PATHS.getProjectConfigFilePath()

    // Check if either global or project config exists
    const fs = await import('fs')
    const hasGlobalConfig = fs.existsSync(configPath)
    const hasProjectConfig = fs.existsSync(projectConfigPath)

    if (!hasGlobalConfig && !hasProjectConfig) {
      console.error('\x1b[31m※ Error: No configuration file found.\x1b[0m')
      console.error(
        '\x1b[31m※ Coda requires a configuration file to run.\x1b[0m',
      )
      console.error(
        '\x1b[31m※ To create a config file, run: coda cc-init\x1b[0m',
      )
      return {
        appConfig,
        toolsetArgs: [],
        childArgs: [],
        shouldExit: true,
        exitCode: 1,
        knownOptions,
        hasPrintOption,
      }
    }
  }

  if (!ignoreGlobalConfig) {
    try {
      const loadedConfig = await loadConfigFile(options?.configPath)
      appConfig = { ...appConfig, ...loadedConfig }
    } catch (error) {
      console.error('Error loading configuration:', error)
      return {
        appConfig,
        toolsetArgs: [],
        childArgs: [],
        shouldExit: true,
        exitCode: 1,
        knownOptions,
        hasPrintOption,
      }
    }
  } else {
    log('※ Ignoring global configuration file')
  }

  if (parsedOptions.stickyNotifications !== undefined) {
    // Handle --sticky-notifications flag (global override)
    if (parsedOptions.stickyNotifications === true) {
      appConfig.sticky_notifications = { global: true }
      appConfig.show_notifications = true
    } else if (parsedOptions.stickyNotifications === false) {
      // --no-sticky-notifications means use per-type settings
      if (typeof appConfig.sticky_notifications === 'boolean') {
        appConfig.sticky_notifications = { global: false }
      }
    }
  }

  if (parsedOptions.showNotifications !== undefined) {
    appConfig.show_notifications = parsedOptions.showNotifications
  }
  if (parsedOptions.dangerouslyAllowInDirtyDirectory !== undefined) {
    appConfig.dangerously_allow_in_dirty_directory =
      parsedOptions.dangerouslyAllowInDirtyDirectory
  }
  if (parsedOptions.dangerouslyAllowWithoutVersionControl !== undefined) {
    appConfig.dangerously_allow_without_version_control =
      parsedOptions.dangerouslyAllowWithoutVersionControl
  }
  if (parsedOptions.dangerouslySuppressYoloConfirmation !== undefined) {
    appConfig.dangerously_suppress_yolo_confirmation =
      parsedOptions.dangerouslySuppressYoloConfirmation
  }
  if (parsedOptions.yolo !== undefined) {
    appConfig.yolo = parsedOptions.yolo
  }
  if (parsedOptions.logAllPatternMatches !== undefined) {
    appConfig.log_all_pattern_matches = parsedOptions.logAllPatternMatches
  }
  if (parsedOptions.allowBufferSnapshots !== undefined) {
    appConfig.allow_buffer_snapshots = parsedOptions.allowBufferSnapshots
  }
  // Handle mode: CLI flag takes precedence over config
  if (parsedOptions.mode !== undefined) {
    appConfig.mode = parsedOptions.mode
  }
  // Handle provider: CLI flag takes precedence over config
  if (parsedOptions.provider !== undefined) {
    if (!['claude-code', 'gemini'].includes(parsedOptions.provider)) {
      console.error(`\x1b[31m※ Error: Invalid provider '${parsedOptions.provider}'. Must be 'claude-code' or 'gemini'.\x1b[0m`)
      return {
        appConfig,
        toolsetArgs: [],
        childArgs: [],
        shouldExit: true,
        exitCode: 1,
        knownOptions,
        hasPrintOption,
      }
    }
    appConfig.provider = parsedOptions.provider as 'claude-code' | 'gemini'
  } else if (!isPrint && !isSubcommand && (appConfig.always_ask_provider || !appConfig.provider)) {
    // No CLI flag provided and either always_ask_provider is true or no provider configured
    const { askProviderSelection } = await import('../cli/prompts.js')
    const { ProviderDetector } = await import('../utils/provider-detector.js')
    
    // Auto-detect available providers
    const availableProviders = await ProviderDetector.detectAvailableProviders()
    
    const selectedProvider = await askProviderSelection(
      appConfig.provider || 'claude-code',
      availableProviders,
      options?.stdin,
      options?.stdout
    )
    
    if (!selectedProvider) {
      log('※ No provider selected. Exiting.')
      return {
        appConfig,
        toolsetArgs: [],
        childArgs: [],
        shouldExit: true,
        exitCode: 130, // User cancelled
        knownOptions,
        hasPrintOption,
      }
    }
    
    appConfig.provider = selectedProvider
  }
  // If no CLI flag provided, config value is preserved from loadConfigFile above

  let toolsetArgs: string[] = []
  let tempMcpConfigPath: string | undefined

  let toolsetsToLoad: string[] = []
  if (parsedOptions.toolset && parsedOptions.toolset.length > 0) {
    toolsetsToLoad = parsedOptions.toolset
  } else if (appConfig.toolsets && appConfig.toolsets.length > 0) {
    toolsetsToLoad = appConfig.toolsets
  }

  if (toolsetsToLoad.length > 0) {
    try {
      const mergedConfig = await mergeToolsets(toolsetsToLoad)
      const provider = appConfig.provider || 'claude-code'
      toolsetArgs = buildToolsetArgs(mergedConfig, provider)

      // Only add MCP config for Claude Code
      if (provider === 'claude-code' && mergedConfig.mcp && Object.keys(mergedConfig.mcp).length > 0) {
        tempMcpConfigPath = createTempMcpConfig(mergedConfig.mcp)
        toolsetArgs.push('--mcp-config', tempMcpConfigPath)
      }
    } catch (error) {
      console.error(
        `\x1b[31m※ Error: ${error instanceof Error ? error.message : error}\x1b[0m`,
      )
      return {
        appConfig,
        toolsetArgs: [],
        childArgs: [],
        shouldExit: true,
        exitCode: 1,
        knownOptions,
        hasPrintOption,
      }
    }
  }

  const hasToolsetFlag =
    parsedOptions.toolset && parsedOptions.toolset.length > 0
  const hasToolsetConfig = appConfig.toolsets && appConfig.toolsets.length > 0
  const hasToolsetConfiguration = hasToolsetFlag || hasToolsetConfig

  const mutuallyExclusiveFlags = [
    '--mcp-config',
    '--allowed-tools',
    '--disallowed-tools',
  ]
  const usedMutuallyExclusiveFlags = argv.filter(arg => {
    return mutuallyExclusiveFlags.some(
      flag => arg === flag || arg.startsWith(flag + '='),
    )
  })

  if (hasToolsetConfiguration && usedMutuallyExclusiveFlags.length > 0) {
    const toolsetSource = hasToolsetFlag ? '--toolset' : 'toolsets in config'
    console.error(
      `※ Error: ${toolsetSource} is mutually exclusive with: ${usedMutuallyExclusiveFlags.join(', ')}`,
    )
    return {
      appConfig,
      toolsetArgs: [],
      childArgs: [],
      shouldExit: true,
      exitCode: 1,
      knownOptions,
      hasPrintOption,
    }
  }

  const childArgs: string[] = []
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (!knownOptions.has(arg)) {
      childArgs.push(arg)
      // If this is an unknown option that expects a value, include the next argument too
      if (arg.startsWith('--') && !arg.includes('=') && i + 1 < argv.length) {
        const nextArg = argv[i + 1]
        // Only skip the next arg if it's not another option
        if (nextArg && !nextArg.startsWith('-')) {
          i++
          childArgs.push(nextArg)
        }
      }
    } else if (arg === '--toolset' && i + 1 < argv.length) {
      i++
    } else if (arg === '--mode' && i + 1 < argv.length) {
      i++
    } else if (arg === '--provider' && i + 1 < argv.length) {
      i++
    }
  }

  // Only add toolset args if they exist (provider-specific filtering already done)
  if (toolsetArgs.length > 0) {
    childArgs.push(...toolsetArgs)
  }
  
  // Handle provider-specific flags
  if ((appConfig.provider || 'claude-code') === 'gemini' && appConfig.yolo) {
    // Gemini uses -y or --yolo for YOLO mode
    childArgs.push('--yolo')
  }

  if (isPrint) {
    log(`※ Starting Claude Code in non-interactive mode due to --print option`)
    return {
      appConfig,
      toolsetArgs,

      childArgs,
      shouldExit: true,
      exitCode: 0,
      knownOptions,
      hasPrintOption,
    }
  }

  if (isSubcommand) {
    log(`※ Running subcommand: ${subcommandResult.subcommand}`)
    return {
      appConfig,
      toolsetArgs,

      childArgs: argv.slice(2), // Use original args for subcommands
      shouldExit: true,
      exitCode: 0,
      knownOptions,
      hasPrintOption,
    }
  }

  try {
    checkGitInstalled()
  } catch (error) {
    console.error(`※ ${error instanceof Error ? error.message : error}`)
    return {
      appConfig,
      toolsetArgs,

      childArgs,
      shouldExit: true,
      exitCode: 1,
      knownOptions,
      hasPrintOption,
    }
  }

  // Find the AI provider command based on configuration
  const provider = appConfig.provider || 'claude-code'
  const providerPath = appConfig.provider_path
  
  try {
    const { AI_PROVIDER_PATHS } = await import('../config/paths.js')
    const childAppPath = AI_PROVIDER_PATHS.findProviderCommand(provider, providerPath)
    checkChildAppPath(childAppPath)
  } catch (error) {
    console.error(`※ ${error instanceof Error ? error.message : error}`)
    return {
      appConfig,
      toolsetArgs,

      childArgs,
      shouldExit: true,
      exitCode: 1,
      knownOptions,
      hasPrintOption,
    }
  }

  try {
    const hasVersionControl = await checkVersionControl(
      process.cwd(),
      appConfig.dangerously_allow_without_version_control,
      options,
      appConfig,
    )

    if (!hasVersionControl) {
      warn('※ Dangerously running in project without version control')
    } else {
      const isDirty = await checkDirtyDirectory(
        process.cwd(),
        appConfig.dangerously_allow_in_dirty_directory,
        options,
        appConfig,
      )

      if (isDirty) {
        warn('※ Dangerously running in directory with uncommitted changes')
      }
    }
  } catch (error) {
    console.error(
      `※ Exiting: ${error instanceof Error ? error.message : error}`,
    )
    return {
      appConfig,
      toolsetArgs,

      childArgs,
      shouldExit: true,
      exitCode: 1,
      knownOptions,
      hasPrintOption,
    }
  }

  if (appConfig.show_notifications !== false) {
    log('※ Notifications are enabled')
  }

  const automaticAcceptanceConfirmed = await handleAutomaticAcceptanceWarning(
    appConfig,
    options,
  )
  if (!automaticAcceptanceConfirmed) {
    return {
      appConfig,
      toolsetArgs,

      childArgs,
      shouldExit: true,
      exitCode: 0,
      knownOptions,
      hasPrintOption,
    }
  }

  const providerName = appConfig.provider === 'gemini' ? 'Gemini' : 'Claude'
  log(`※ Getting ready to launch ${providerName} CLI`)

  return {
    appConfig,
    toolsetArgs,
    childArgs,
    tempMcpConfigPath,
    shouldExit: false,
    knownOptions,
    hasPrintOption,
    yolo: appConfig.yolo,
  }
}

import { CONFIG_PATHS } from '../config/paths'
export const getConfigDirectory = CONFIG_PATHS.getConfigDirectory
export { log, warn } from '../utils/logging.js'
