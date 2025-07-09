# Coda Usage Examples

## Installation & Setup

```bash
# Install globally
npm install -g coda-cli

# Or use locally in a project
npm install --save-dev coda-cli
```

## Initial Configuration

```bash
# Initialize Coda (interactive setup)
coda cc-init

# Initialize with specific options
coda cc-init --use-yolo --use-core-toolset

# Initialize project-specific config
coda cc-init --project
```

## Basic Usage

```bash
# Use with your chosen AI provider (Claude Code or Gemini)
coda "explain this error: TypeError: Cannot read property 'x' of undefined"

# Enable YOLO mode for a single session
coda --yolo "refactor this function to use async/await"

# Use specific toolsets
coda --toolset backend-tools "add error handling to the database connection"

# Start in planning mode
coda --mode plan "implement user authentication"

# Debug mode for troubleshooting
coda --debug "why is this test failing?"
```

## Working with Different Providers

### Claude Code (default)

```bash
# Using Claude Code
coda "help me understand this React component"
```

### Gemini

```bash
# If you configured Gemini as your provider
coda "optimize this SQL query"

# Or override temporarily with environment variable
GEMINI_APP_PATH=/custom/path/gemini coda "explain this algorithm"
```

## Statistics and History

```bash
# View general statistics
coda stats

# View command history
coda stats --history

# View session recordings
coda stats --sessions

# Export statistics to JSON
coda stats --export my-stats.json

# Limit history display
coda stats --history --limit 50
```

## Advanced Usage

### Project-Specific Configuration

1. Create `.coda/config.yaml` in your project:

```yaml
provider: gemini # Use Gemini for this project
yolo: true # Auto-accept prompts
toolsets:
  - project:custom-tools
```

### Custom Toolsets

1. Create `~/.coda/toolsets/frontend.yaml`:

```yaml
allowed:
  - read_file
  - write_file
  - search_files
disallowed:
  - execute_bash # No shell commands for frontend work
```

2. Use it:

```bash
coda --toolset frontend "convert this component to TypeScript"
```

### Safety Overrides

```bash
# Allow running with uncommitted changes
coda --dangerously-allow-in-dirty-directory "quick fix"

# Allow running without git
coda --dangerously-allow-without-version-control "prototype this feature"

# Suppress YOLO confirmation
coda --yolo --dangerously-suppress-yolo-confirmation "batch process these files"
```

### Working with Notifications

```bash
# Enable desktop notifications
coda --show-notifications "refactor this module"

# Sticky notifications (stay on screen)
coda --sticky-notifications "implement complex feature"

# Disable notifications for this run
coda --no-show-notifications "simple task"
```

## Environment Variables

```bash
# Override config directory
CODA_CONFIG_DIR=/custom/config coda "help"

# Set AI provider paths
CLAUDE_APP_PATH=/usr/local/bin/claude coda "task"
GEMINI_APP_PATH=/opt/gemini/bin/gemini coda "task"

# Enable debug mode
DEBUG=1 coda "debug this issue"
```

## Common Workflows

### 1. Quick Fix with Auto-Accept

```bash
coda --yolo "fix the TypeError in app.js line 42"
```

### 2. Planning a Feature

```bash
coda --mode plan "add user authentication with JWT"
```

### 3. Batch Processing

```bash
# In a script
for file in src/*.js; do
  coda --yolo --quiet "add JSDoc comments to $file"
done
```

### 4. Project Setup

```bash
# Initialize project config
cd my-project
coda cc-init --project

# Use project-specific tools
coda --toolset project:api-tools "set up REST endpoints"
```

### 5. Analyzing Code Quality

```bash
# Review and get suggestions
coda "review this code for potential issues and suggest improvements"

# Check statistics after
coda stats --history --limit 10
```

## Tips

1. **Use YOLO mode carefully** - It auto-accepts all prompts
2. **Create project configs** - Different settings per project
3. **Custom toolsets** - Control what the AI can do
4. **Check stats regularly** - Understand your usage patterns
5. **Enable debug mode** - When things aren't working as expected
6. **Session recordings** - Review what happened in past sessions
