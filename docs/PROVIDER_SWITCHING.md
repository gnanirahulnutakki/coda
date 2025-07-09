# Provider Switching in Coda

Coda now supports multiple AI providers (Claude Code and Gemini). Here's how to switch between them:

## Current Behavior

When you run `coda` without arguments, it uses the provider configured in your `~/.coda/config.yaml` file. By default, this is set to `claude-code`.

## Ways to Switch Providers

### 1. **Use the `switch` command** (Recommended)

```bash
# Interactive provider selection
coda switch

# Direct switch
coda switch gemini
coda switch claude-code
```

This command:

- Auto-detects which providers are installed
- Shows checkmarks (✓) for available providers
- Updates your config file permanently

### 2. **Use the `--provider` flag** (Temporary)

```bash
# Use Gemini for just this session
coda --provider gemini "explain this code"

# Use Claude Code for just this session
coda --provider claude-code "refactor this function"
```

This flag:

- Overrides the config for one session only
- Doesn't change your default provider
- Useful for testing or specific tasks

### 3. **Edit config file directly**

```bash
# Edit ~/.coda/config.yaml
nano ~/.coda/config.yaml

# Change this line:
provider: claude-code
# To:
provider: gemini
```

### 4. **Reinitialize configuration**

```bash
# Remove existing config and start fresh
rm ~/.coda/config.yaml
coda cc-init
```

During initialization, you'll be prompted to choose your provider.

## Checking Your Setup

### Run diagnostics

```bash
coda doctor
```

This shows:

- Current provider configuration
- Which providers are installed
- Where they're located
- Installation recommendations

### Check current provider

```bash
cat ~/.coda/config.yaml | grep provider
```

## Provider-Specific Paths

If your AI provider is installed in a non-standard location, you can specify a custom path:

### During switch

```bash
coda switch
# When prompted, enter the full path to the provider executable
```

### In config file

```yaml
provider: gemini
provider_path: /custom/path/to/gemini
```

### Via environment variable

```bash
export CLAUDE_APP_PATH=/path/to/claude
export GEMINI_APP_PATH=/path/to/gemini
```

## Examples

### Quick provider test

```bash
# Test with Claude Code
coda --provider claude-code "hello"

# Test with Gemini
coda --provider gemini "hello"
```

### Project-specific provider

Create `.coda/config.yaml` in your project:

```yaml
provider: gemini # This project uses Gemini
```

Now `coda` will use Gemini when run from this project directory.

## Troubleshooting

If a provider isn't working:

1. **Run diagnostics**: `coda doctor`
2. **Check if installed**: `which claude` or `which gemini`
3. **Try custom path**: Use `provider_path` in config
4. **Check permissions**: Ensure the executable has proper permissions
5. **Enable debug mode**: `coda --debug` to see which path is being used

## Default Search Locations

Coda looks for providers in these locations (in order):

1. Custom path (from config or flag)
2. Environment variable (CLAUDE_APP_PATH or GEMINI_APP_PATH)
3. System PATH
4. Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`)
5. npm global installations
6. Default locations (`~/.claude/local`, `~/.gemini/bin`)
7. Platform-specific locations
