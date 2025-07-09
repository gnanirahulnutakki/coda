# YOLO Mode Guide

YOLO (You Only Live Once) mode in Coda allows AI to execute ALL actions without asking for permission. This is perfect for automation, CI/CD pipelines, or when you trust the AI completely.

## What YOLO Mode Does

When YOLO mode is enabled, Coda will:
- ✅ Skip ALL permission prompts for file edits
- ✅ Skip ALL permission prompts for running commands
- ✅ Automatically accept trust prompts for directories
- ✅ Continue in directories with uncommitted changes
- ✅ Continue in projects without version control
- ✅ Pass `--yolo` flag to Gemini (when using Gemini)

## How to Enable YOLO Mode

### 1. During Initial Setup
```bash
coda cc-init
```
You'll see:
```
⚠️  YOLO Mode Configuration
YOLO mode will:
• Skip ALL permission prompts (file edits, commands, etc.)
• Automatically accept trust prompts for directories
• Let AI make changes without your review
• Work well for automation and CI/CD pipelines

Enable YOLO mode? (AI will execute ALL actions without asking) [y/N]
```

### 2. In Configuration File
```yaml
# ~/.coda/config.yaml
yolo: true
```

### 3. Command Line Flag
```bash
# One-time YOLO mode
coda --yolo "refactor the entire codebase"
```

### 4. Environment Variable
```bash
export CODA_YOLO=true
coda "fix all the bugs"
```

## YOLO Mode Behavior

### File Operations
Without YOLO:
```
Edit file: src/main.js
Do you want to proceed? [y/N]
```

With YOLO:
```
✓ Edited src/main.js (auto-accepted)
```

### Bash Commands
Without YOLO:
```
Bash command: rm -rf node_modules
Do you want to proceed? [y/N]
```

With YOLO:
```
✓ Executed: rm -rf node_modules (auto-accepted)
```

### Directory Trust
Without YOLO:
```
Do you trust the files in this folder? [y/N]
```

With YOLO:
```
✓ Directory trusted (YOLO mode)
```

### Git Safety Checks
Without YOLO:
```
※ Running in directory with uncommitted changes
※ Do you want to continue? [y/N]
```

With YOLO:
```
※ Running in directory with uncommitted changes
※ YOLO mode: Continuing with uncommitted changes
```

## Use Cases

### 1. CI/CD Pipelines
```yaml
# .github/workflows/ai-assist.yml
- name: AI Code Review
  run: |
    npm install -g coda-cli
    coda --yolo "review and fix any issues in the PR"
```

### 2. Automated Scripts
```bash
#!/bin/bash
# auto-refactor.sh
coda --yolo "update all deprecated APIs to latest version"
coda --yolo "add missing type annotations"
coda --yolo "fix all ESLint warnings"
```

### 3. Trusted Environments
```bash
# In your development environment where you have backups
coda --yolo "implement the new feature we discussed"
```

### 4. Batch Operations
```bash
# Process multiple files without interruption
for file in src/*.js; do
  coda --yolo "add JSDoc comments to $file"
done
```

## Safety Considerations

### ⚠️ WARNING: YOLO Mode Risks
- **No Undo**: Changes are immediate and permanent
- **No Review**: You won't see what's changing before it happens
- **Full Trust**: AI can modify/delete any file it has access to

### 🛡️ Best Practices
1. **Use Version Control**: Always have git commits to rollback to
2. **Test First**: Try without YOLO mode on a sample first
3. **Limit Scope**: Be specific in your prompts
4. **Backup Critical Data**: Have backups before YOLO operations
5. **Use in Containers**: Run YOLO mode in Docker/sandboxes when possible

### 🚫 When NOT to Use YOLO Mode
- Production environments
- Repositories without version control
- When working with sensitive data
- First time using a new AI model
- Complex refactoring without understanding the plan

## Configuration Precedence

YOLO mode can be set at multiple levels (highest to lowest priority):
1. Command line flag: `--yolo`
2. Environment variable: `CODA_YOLO=true`
3. Project config: `.coda/config.yaml`
4. Global config: `~/.coda/config.yaml`

## Combining with Other Features

### YOLO + Provider Selection
```bash
# Skip both provider selection AND all prompts
coda --provider gemini --yolo "optimize the database queries"
```

### YOLO + Toolsets
```bash
# Restrict tools but auto-accept their usage
coda --toolset backend --yolo "add caching layer"
```

### YOLO + Debug Mode
```bash
# See what's happening but don't stop for prompts
coda --yolo --debug "refactor authentication"
```

## Disabling YOLO Mode

### Temporarily
```bash
# Force interactive mode even if config has yolo: true
coda --no-yolo "delete old files"
```

### Permanently
```bash
# Edit ~/.coda/config.yaml
yolo: false

# Or remove the line entirely
```

## YOLO Mode Status

You can check if YOLO mode is active:
```bash
# During execution, you'll see:
✔ ※ YOLO mode enabled - all prompts will be automatically accepted

# Or in debug mode:
coda --debug
# Shows: YOLO mode: enabled/disabled
```

## Emergency Stop

If YOLO mode is doing something unexpected:
- **Ctrl+C**: Immediately stops execution
- **Kill the process**: `pkill coda`
- **Revert changes**: `git reset --hard HEAD`

## Summary

YOLO mode is powerful but dangerous. Use it when:
- You have good backups
- You trust the AI completely
- You need automation
- You're in a safe environment

Avoid it when:
- Working on production code
- No version control
- First time trying something
- Working with critical data

Remember: With great YOLO comes great responsibility! 🚀