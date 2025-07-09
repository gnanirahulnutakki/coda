# Interactive Provider Selection

Coda now supports interactive provider selection every time you run it, similar to how YOLO mode confirmation works.

## How It Works

When you run `coda` without specifying a provider, you'll see:

```
※ Select AI provider
❯ Claude Code (current)
  Gemini
```

Use arrow keys to select and press Enter to confirm.

## Configuration Options

### Always Ask for Provider

Add this to your `~/.coda/config.yaml`:

```yaml
always_ask_provider: true
```

With this setting, Coda will prompt you to select a provider every time you run it, even if you have a default provider configured.

### Default Behavior

Without `always_ask_provider`, Coda will:
1. Use the `--provider` flag if specified
2. Use the provider from your config file
3. Only prompt if no provider is configured

## Command-Line Options

### Skip the prompt with `--provider` flag
```bash
# Use Claude Code directly
coda --provider claude-code "your prompt"

# Use Gemini directly  
coda --provider gemini "your prompt"
```

### Permanent switch
```bash
# Change default provider
coda switch gemini

# Then disable always_ask_provider if you want
# Edit ~/.coda/config.yaml and set:
# always_ask_provider: false
```

## Examples

### Interactive Selection Every Time
```yaml
# ~/.coda/config.yaml
provider: claude-code
always_ask_provider: true
```

Now every `coda` command will ask:
```
※ Select AI provider
❯ Claude Code (current)
  Gemini
```

### Project-Specific Behavior
```yaml
# .coda/config.yaml (in project)
provider: gemini
always_ask_provider: false  # Don't ask in this project
```

### Mixed Workflow
```bash
# Morning: Interactive selection
coda
# Select: Claude Code
# "plan the day's work"

# Afternoon: Quick Gemini command
coda --provider gemini "implement the plan"

# Evening: Back to interactive
coda
# Select: Claude Code  
# "review and commit changes"
```

## Provider Detection

The selection menu shows which providers are available:
- `Claude Code` - If found on system
- `Gemini` - If found on system
- `(current)` - Shows your current default

If a provider isn't installed, it will still appear in the menu but may fail when selected.

## Keyboard Shortcuts

- **Arrow keys**: Navigate options
- **Enter**: Select provider
- **Ctrl+C**: Cancel (exits Coda)

## Disabling Interactive Selection

To go back to using your default provider without prompts:

1. Edit `~/.coda/config.yaml`
2. Set `always_ask_provider: false` or remove the line
3. Make sure `provider` is set to your preferred default

## Use Cases

### 1. Comparing Providers
When you want to quickly test the same prompt with different providers:
```bash
coda  # Select Claude Code
"explain this error"

coda  # Select Gemini
"explain this error"
```

### 2. Task-Based Selection
Different providers for different tasks:
```bash
coda  # Select Claude Code for careful code edits
"refactor with minimal changes"

coda  # Select Gemini for broad analysis
"analyze the entire codebase architecture"
```

### 3. Learning and Experimentation
New users can explore both providers without memorizing flags:
```bash
coda  # Try Claude Code
coda  # Try Gemini
```

## Notes

- The selection prompt appears after configuration loading but before any other prompts
- It uses the same TTY handling as YOLO confirmation, so it works in various terminal environments
- Your selection only applies to the current command - it doesn't change your config file
- Use `coda switch` if you want to change your default provider permanently