# Coda Demo Screenshots

Since the TTY detection is preventing a live demo in this environment, here's what you would see when running Coda interactively in a proper terminal:

## 1. Help Menu (`coda --help`)

```
Usage: coda [options] [args...]

A powerful code development assistant for AI-powered workflows

Subcommands:
  cc-init                  Initialize a new configuration file
  stats                    Display usage statistics and command history

Options:
  --toolset <name...>              Use predefined toolsets from ~/.coda/toolsets/ directory
  --yolo                           Accept all prompts automatically (use with caution)
  --ignore-global-config           Ignore configuration from ~/.coda/config.yaml
  --quiet                          Suppress preflight messages
  --debug                          Enable debug mode with verbose logging
  --mode <mode>                    Start mode (act or plan)
  --allow-buffer-snapshots         Enable Ctrl+Shift+S to save terminal buffer snapshots
  --log-all-pattern-matches        Log all pattern matches to ~/.coda/logs/
  --dangerously-allow-in-dirty-directory     Allow running in a directory with uncommitted changes
  --dangerously-allow-without-version-control Allow running without version control
  --show-notifications             Show desktop notifications for file edits
  --sticky-notifications           Enable notifications that stay on screen
  -h, --help                       display help for command

--- Claude/Gemini CLI Help ---
[The chosen provider's help would appear here]
```

## 2. Initialization (`coda cc-init`)

```
? Which AI provider would you like to use? (Use arrow keys)
❯ Claude Code
  Gemini

? Enter custom path to claude-code CLI (or press enter to use default): 

? Would you like to enable YOLO mode? (accepts all prompts automatically) › No / Yes

? Would you like to enable the core toolset? › (Y/n)

✅ Created configuration file at /Users/username/.coda/config.yaml
✓ YOLO mode disabled - all prompts will require confirmation
✓ Core toolset enabled
```

## 3. Configuration File Created

```yaml
# ~/.coda/config.yaml
provider: claude-code
yolo: false
toolsets:
  - internal:core
roots: []
```

## 4. Running Coda (`coda "explain this error"`)

```
※ Using Claude Code provider
※ Ready, Passing off control to Claude CLI

[Claude/Gemini would then take over with the enhanced features]
```

## 5. Stats Command (`coda stats`)

```
╔═══════════════════════════════════════════════════════════════╗
║                      Coda Statistics                          ║
╠═══════════════════════════════════════════════════════════════╣
║ Total Commands Run:      42                                   ║
║ Success Rate:            95.2%                                ║
║ Average Duration:        2.3s                                 ║
╠═══════════════════════════════════════════════════════════════╣
║                    Most Used Commands                         ║
╠═══════════════════════════════════════════════════════════════╣
║ explain: 15 times                                             ║
║ fix: 12 times                                                 ║
║ refactor: 8 times                                            ║
╠═══════════════════════════════════════════════════════════════╣
║                   Commands by Project                         ║
╠═══════════════════════════════════════════════════════════════╣
║ my-app: 25 commands                                           ║
║ api-server: 17 commands                                       ║
╠═══════════════════════════════════════════════════════════════╣
║                     Storage Usage                             ║
╠═══════════════════════════════════════════════════════════════╣
║ Config Directory:        125 KB                               ║
║ Log Files:               2.1 MB                               ║
║ Session Records:         850 KB                               ║
║ Total:                   3.1 MB                               ║
╚═══════════════════════════════════════════════════════════════╝
```

## 6. Stats with Sessions (`coda stats --sessions`)

```
📹 Session Recording Statistics
═══════════════════════════════════
Total Sessions: 15

📅 Recent Sessions:
  1. [2024-07-08 13:45:23] my-project - 5m 32s (234 events)
  2. [2024-07-08 12:30:15] api-server - 12m 18s (567 events)
  3. [2024-07-08 11:15:42] frontend-app - 3m 45s (189 events)

💾 Session Storage: 850 KB (30 files)
```

## 7. Directory Structure After Use

```
~/.coda/
├── config.yaml           # Global configuration
├── toolsets/            # Custom toolsets
│   ├── backend.yaml
│   └── frontend.yaml
├── logs/                # Debug and pattern logs
│   ├── coda-2024-07-08.log
│   └── pattern-matches-*.jsonl
├── sessions/            # Session recordings
│   ├── session-2024-07-08T13-45-23-abc123.jsonl
│   └── session-2024-07-08T13-45-23-abc123.meta.json
└── history/             # Command history
    └── commands.jsonl
```

## Key Features in Action:

1. **Provider Selection**: Choose between Claude Code or Gemini during init
2. **Auto-acceptance**: YOLO mode for automated workflows
3. **Session Recording**: All interactions are recorded for later analysis
4. **Command History**: Track what commands you use most
5. **Statistics**: Understand your AI usage patterns
6. **Safety Guards**: Warnings for uncommitted changes
7. **Debug Mode**: `--debug` flag for troubleshooting