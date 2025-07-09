# Path Detection Fix Summary

## Issues Identified

1. **Claude Code crash**: The tool was looking for Claude in `~/.claude/local/claude` but it's actually installed at `/opt/homebrew/bin/claude`
2. **No provider prompt**: The initialization already had a config file, so it wasn't prompting for provider selection
3. **Cross-platform path issues**: Different systems install AI providers in different locations

## Solutions Implemented

### 1. Smart Provider Detection (`src/utils/provider-detector.ts`)

Created a comprehensive provider detection system that checks multiple locations in order:

- Custom path (from config)
- Environment variables (CLAUDE_APP_PATH, GEMINI_APP_PATH)
- System PATH (using `which`)
- Homebrew locations (`/opt/homebrew/bin`, `/usr/local/bin`)
- npm global installations
- Local installations (`~/.claude/local`, `~/.gemini/bin`)
- Platform-specific locations (Windows, macOS Applications)

### 2. Updated Path Finding (`src/config/paths.ts`)

Modified `findProviderCommand` to:

- Prioritize system-installed versions (PATH) over local installations
- Check executable permissions
- Provide detailed error messages showing all checked locations

### 3. Enhanced Initialization (`src/cli/cc-init.ts`)

- Auto-detects available providers during setup
- Shows checkmarks (✓) for found providers
- Disables selection for providers not found
- Still allows configuration for later installation

### 4. Better Error Handling (`src/terminal/manager.ts`)

- Catches spawn errors with helpful messages
- Detects early startup errors (Electron/Squirrel issues)
- Provides actionable solutions

### 5. New Diagnostic Command (`coda doctor`)

Added a diagnostic command that:

- Checks configuration files
- Detects all AI providers
- Shows which paths were checked
- Provides installation recommendations

## Usage

### Run diagnostics

```bash
coda doctor
```

This will show:

- Configuration status
- AI provider detection results
- Environment information
- Recommendations for fixing issues

### Force path detection (debug mode)

```bash
coda --debug "your prompt"
```

This will show which provider path is being used.

### Manual path configuration

If automatic detection fails, users can:

1. Set environment variable: `export CLAUDE_APP_PATH=/path/to/claude`
2. Add to config file:
   ```yaml
   provider: claude-code
   provider_path: /path/to/claude
   ```
3. Use during initialization when prompted for custom path

## Benefits

1. **Automatic detection**: Works out of the box on most systems
2. **Multiple fallbacks**: Tries various installation methods
3. **Clear diagnostics**: Users can easily troubleshoot issues
4. **Cross-platform**: Handles Windows, macOS, and Linux paths
5. **Future-proof**: Easy to add new installation locations
