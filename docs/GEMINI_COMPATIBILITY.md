# Gemini Compatibility in Coda

Coda now fully supports Gemini CLI alongside Claude Code. Here's what you need to know:

## Key Differences

### Command-Line Arguments

- **Claude Code**: Uses `--allowedTools`, `--disallowedTools`, `--mcp-config`
- **Gemini**: Uses different flags (`-m/--model`, `-p/--prompt`, `-s/--sandbox`, etc.)

Coda automatically handles these differences - toolset configurations only apply to Claude Code.

### YOLO Mode

- **Claude Code**: Configured via Coda's config file
- **Gemini**: Coda passes `--yolo` flag when YOLO mode is enabled

## Using Gemini with Coda

### 1. Quick Test

```bash
# Use Gemini for one command
coda --provider gemini "explain this code"

# With YOLO mode
coda --provider gemini --yolo "refactor this function"
```

### 2. Switch Default Provider

```bash
# Interactive switch
coda switch

# Direct switch
coda switch gemini
```

### 3. Check Setup

```bash
# Run diagnostics
coda doctor

# This will show:
# - If Gemini is installed
# - Where it's located
# - Current configuration
```

## Configuration

### Global Config (`~/.coda/config.yaml`)

```yaml
# Use Gemini as default
provider: gemini

# Optional: custom path
provider_path: /path/to/gemini

# YOLO mode works with both providers
yolo: true
```

### Project Config (`.coda/config.yaml`)

```yaml
# This project uses Gemini
provider: gemini

# Project-specific YOLO mode
yolo: true
```

## Feature Compatibility

| Feature           | Claude Code | Gemini | Notes                   |
| ----------------- | ----------- | ------ | ----------------------- |
| Basic prompts     | ✅          | ✅     | Full support            |
| YOLO mode         | ✅          | ✅     | Auto-mapped to `--yolo` |
| Toolsets          | ✅          | ⚠️     | Ignored for Gemini      |
| MCP servers       | ✅          | ❌     | Claude-only feature     |
| Stats tracking    | ✅          | ✅     | Works for both          |
| Notifications     | ✅          | ✅     | Works for both          |
| Session recording | ✅          | ✅     | Works for both          |

## Examples

### Basic Usage

```bash
# Ask a question
coda --provider gemini "how do I implement a singleton pattern?"

# Work with files (Gemini will include all files by default)
coda --provider gemini "refactor main.py to use async/await"
```

### With Gemini-Specific Options

Since Coda passes unknown arguments to the provider, you can use Gemini flags:

```bash
# Use a specific model
coda --provider gemini -m gemini-2.5-pro "your prompt"

# Enable sandbox mode
coda --provider gemini -s "run this code safely"

# Show memory usage
coda --provider gemini --show_memory_usage "analyze this large codebase"
```

### Switching Between Providers

```bash
# Morning: Use Claude for planning
coda --provider claude-code "plan the refactoring of the auth system"

# Afternoon: Use Gemini for implementation
coda --provider gemini "implement the auth refactoring we planned"

# Or switch permanently
coda switch gemini
```

## Troubleshooting

### "Unknown arguments" Error

If you see errors about unknown arguments when using Gemini, it means Coda is passing Claude-specific flags. This has been fixed, but if you encounter it:

1. Update to the latest version
2. Check your toolset configuration (toolsets don't apply to Gemini)
3. Report the issue with the full command

### Gemini Not Found

```bash
# 1. Check if Gemini is installed
which gemini

# 2. Run diagnostics
coda doctor

# 3. Set custom path if needed
coda switch gemini
# Enter the full path when prompted
```

### Different Behavior

Gemini and Claude Code have different capabilities and behaviors:

- Gemini includes all files by default (use `-a false` to disable)
- Gemini has different model options
- Some features like MCP servers are Claude-only

## Best Practices

1. **Choose the right tool**:
   - Claude Code: Better for controlled edits with toolsets
   - Gemini: Better for broad analysis with sandbox support

2. **Project-specific configs**: Set provider per project based on needs

3. **Use provider flags**: Take advantage of each provider's unique features

4. **Monitor usage**: Use `coda stats` to track usage across both providers
