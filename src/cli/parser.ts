import { Command } from 'commander'
import type { ParsedOptions } from '../types/preflight.js'

export function createClaudeComposerCommand(): Command {
  const program = new Command()
  program
    .name('coda')
    .description(
      'A powerful code development assistant for AI-powered workflows\n\nSubcommands:\n  cc-init                  Initialize a new configuration file\n  switch [provider]        Switch between AI providers (claude-code or gemini)\n  memory <command>         Manage persistent context memory\n  checkpoint <command>     Manage checkpoints and rollback system\n  docs <command>           Index and search documentation\n  costs <command>          Track AI usage costs and token consumption\n  security <command>       Scan code for security vulnerabilities\n  diff <command>           Preview changes before applying them\n  repo <command>           Manage multi-repository context awareness\n  workflow <command>       Manage and run workflow templates\n  offline <command>        Manage offline mode and cached AI responses\n  test <command>           Generate tests and track coverage\n  preset <command>         Manage configuration presets\n  settings <command>       Export/import settings and manage backups\n  wizard                   Interactive configuration wizard\n  stats                    Display usage statistics and command history\n  doctor                   Run diagnostics to check your setup',
    )
    .option(
      '--toolset <name...>',
      'Use predefined toolsets from ~/.coda/toolsets/ directory or specify an absolute path (can be specified multiple times)',
    )
    .option('--yolo', 'Accept all prompts automatically (use with caution)')
    .option(
      '--ignore-global-config',
      'Ignore configuration from ~/.coda/config.yaml',
    )
    .option('--quiet', 'Suppress preflight messages')
    .option('--debug', 'Enable debug mode with verbose logging')
    .option('--mode <mode>', 'Start mode (act or plan)')
    .option('--provider <provider>', 'Use a specific AI provider for this session (claude-code or gemini)')
    .option(
      '--allow-buffer-snapshots',
      'Enable Ctrl+Shift+S to save terminal buffer snapshots to ~/.coda/logs/',
    )
    .option(
      '--log-all-pattern-matches',
      'Log all pattern matches to ~/.coda/logs/pattern-matches-<pattern.id>.jsonl',
    )
    .option(
      '--dangerously-allow-in-dirty-directory',
      'Allow running in a directory with uncommitted git changes',
    )
    .option(
      '--no-dangerously-allow-in-dirty-directory',
      'Do not allow running in a directory with uncommitted git changes',
    )
    .option(
      '--dangerously-allow-without-version-control',
      'Allow running in a directory not under version control',
    )
    .option(
      '--no-dangerously-allow-without-version-control',
      'Do not allow running in a directory not under version control',
    )
    .option(
      '--dangerously-suppress-yolo-confirmation',
      'Suppress the confirmation prompt when yolo mode is enabled',
    )
    .option(
      '--no-dangerously-suppress-yolo-confirmation',
      'Show the confirmation prompt when yolo mode is enabled',
    )
    .option(
      '--dangerously-allow-in-untrusted-root',
      'Allow running in any directory without trust confirmation',
    )
    .option(
      '--no-dangerously-allow-in-untrusted-root',
      'Require trust confirmation for directories not in roots list',
    )
    // Notification options (moved to end)
    .option(
      '--show-notifications',
      'Show desktop notifications for file edits, creates, and prompts',
    )
    .option('--no-show-notifications', 'Disable notifications')
    .option(
      '--sticky-notifications',
      'Enable notifications that stay on screen until manually dismissed (also enables --show-notifications)',
    )
    .option(
      '--no-sticky-notifications',
      'Make notifications auto-dismiss after timeout (default)',
    )
    .allowUnknownOption()
    .argument('[args...]', 'Arguments to pass to `claude`')

  return program
}

export function parseCommandLineArgs(argv: string[]): {
  program: Command
  options: ParsedOptions
  args: string[]
  helpRequested: boolean
  versionRequested: boolean
  hasPrintOption: boolean
} {
  const helpRequested = argv.includes('--help') || argv.includes('-h')
  const versionRequested = argv.includes('--version') || argv.includes('-v')
  const hasPrintOption = argv.some(
    arg => arg === '--print' || arg.startsWith('--print='),
  )

  const program = createClaudeComposerCommand()

  if (helpRequested || versionRequested) {
    program.exitOverride()
    try {
      program.parse(argv)
    } catch (err) {
      if (err.exitCode === 0) {
        return {
          program,
          options: {},
          args: [],
          helpRequested: true,
          versionRequested: false,
          hasPrintOption,
        }
      }
      throw err
    }
  } else {
    program.parse(argv)
  }

  const options = program.opts() as ParsedOptions
  const args = program.args

  return {
    program,
    options,
    args,
    helpRequested,
    versionRequested,
    hasPrintOption,
  }
}

export function buildKnownOptionsSet(program: Command): Set<string> {
  const knownOptions = new Set<string>()

  program.options.forEach(option => {
    if (option.long) knownOptions.add(option.long)
  })

  return knownOptions
}
