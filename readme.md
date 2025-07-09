# 🎯 Coda: AI Coding Made Simple & Safe

> A universal orchestration layer that sits between you and AI coding assistants (Claude, Gemini, Aider, etc.), adding safety features, memory, cost controls, and workflow automation.

[![Tests](https://github.com/gnanirahulnutakki/coda/actions/workflows/test.yml/badge.svg)](https://github.com/gnanirahulnutakki/coda/actions/workflows/test.yml)
[![npm version](https://badge.fury.io/js/coda-cli.svg)](https://badge.fury.io/js/coda-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/gnanirahulnutakki/coda)

## 🤔 What is Coda?

Imagine you hired a brilliant programmer to help you write code, but:

- They might accidentally delete important files
- They could spend too much money (API costs)
- They might forget what you discussed yesterday
- They could introduce security bugs
- You have no "undo" button if something goes wrong

**Coda is like a safety harness and toolkit for AI programmers**. It adds:

- 🛡️ **Safety features** - Automatic backups and rollback
- 💰 **Cost controls** - Set spending limits
- 🧠 **Memory** - Remembers context between sessions
- 🔒 **Security checks** - Scans for vulnerabilities
- 🤝 **Multi-AI support** - Use the best tool for each task

## ✨ Key Features

### Core Safety & Control

- ⏮️ **Checkpoint/Rollback System** - Create restore points before changes
- 💰 **Cost Tracking & Limits** - Monitor API usage and set daily/monthly limits
- 🔒 **Security Scanner** - Automatic detection of hardcoded secrets and vulnerabilities
- 👁️ **Diff Preview** - See changes before applying them
- 🧠 **Persistent Memory** - Save and recall important context across sessions

### AI Provider Support

- 🤖 **Claude Code** - Anthropic's CLI-based assistant
- 🌟 **Gemini** - Google's AI coding assistant
- 🎯 **Aider** - Git-aware pair programming
- 🐙 **GitHub Copilot CLI** - GitHub's command line AI
- 🚀 **Cline.ai** - Autonomous coding agent
- 📝 **Cody** - Sourcegraph's context-aware assistant
- 🔧 **Amazon Q** - AWS coding assistant
- 🎨 **Continue.dev** - Open-source extensible AI

### Workflow Enhancement

- 📋 **Workflow Templates** - Automate repetitive task sequences
- 🧪 **Test Generation** - AI-powered test creation with coverage tracking
- 📚 **Documentation Search** - RAG-powered project documentation search
- 🌐 **Offline Mode** - Cached responses for working without internet
- 🎨 **Preset Configurations** - Quick switching between safety levels
- 🔧 **Interactive Wizard** - Easy setup for beginners

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org))
- Git (for version control features)
- At least one AI provider installed

### Installation

```bash
# Using npm (recommended)
npm install -g coda-cli

# Using yarn
yarn global add coda-cli

# Using pnpm
pnpm add -g coda-cli

# On macOS with Homebrew
brew tap coda/tap
brew install coda-cli
```

### First Time Setup

```bash
# Run the interactive wizard
coda wizard

# Or quick setup
coda init
```

The wizard will:

1. Detect installed AI providers
2. Configure safety settings
3. Set up cost limits
4. Create your first preset

### Basic Usage

```bash
# Start a conversation with your default AI
coda

# Send a specific request
coda "Fix the error in my React component"

# Use a specific provider
coda --provider aider "Refactor this function"

# Check your setup
coda doctor
```

## 📖 Real-World Examples

### Example 1: Safe Development Workflow

```bash
# Morning routine
coda checkpoint create "morning-start"
coda costs show --yesterday

# Before big changes
coda checkpoint create "before-refactor"
coda "Refactor the authentication system"
coda security scan
coda test generate

# Oops, something broke!
coda checkpoint rollback
```

### Example 2: Learning to Code Safely

```bash
# Safe learning environment
coda preset apply cautious
coda checkpoint create "learning-python"

# Ask questions freely
coda "Explain Python decorators with examples"
coda "Help me write a web scraper"

# Save important lessons
coda memory save "python-tips" "Use requests.get() for HTTP requests"
```

### Example 3: Cost-Conscious Development

```bash
# Set spending limits
coda costs set-limit --daily 10
coda costs set-limit --monthly 200

# Work efficiently with caching
coda offline enable
coda "Create a REST API endpoint"  # Uses AI
coda "Create a REST API endpoint"  # Uses cache!

# Track spending
coda costs show --this-month
coda costs export january-invoice.json
```

## 🛠️ All Commands

### Essential Commands

| Command       | Description                  |
| ------------- | ---------------------------- |
| `coda`        | Start interactive AI session |
| `coda wizard` | Run setup wizard             |
| `coda doctor` | Check system health          |
| `coda switch` | Switch AI providers          |

### Safety & Recovery

| Command                         | Description              |
| ------------------------------- | ------------------------ |
| `coda checkpoint create <name>` | Create restore point     |
| `coda checkpoint rollback`      | Undo to last checkpoint  |
| `coda checkpoint list`          | Show all checkpoints     |
| `coda security scan`            | Scan for vulnerabilities |
| `coda diff preview`             | Preview changes          |

### Memory & Context

| Command                          | Description          |
| -------------------------------- | -------------------- |
| `coda memory save <key> <value>` | Save information     |
| `coda memory recall <key>`       | Retrieve saved info  |
| `coda memory list`               | Show all memories    |
| `coda docs index`                | Index project docs   |
| `coda docs search <query>`       | Search documentation |

### Cost Management

| Command                           | Description        |
| --------------------------------- | ------------------ |
| `coda costs show`                 | View current costs |
| `coda costs set-limit --daily 20` | Set daily limit    |
| `coda costs export <file>`        | Export cost report |

### Workflow & Automation

| Command                       | Description                |
| ----------------------------- | -------------------------- |
| `coda workflow create <name>` | Create workflow            |
| `coda workflow run <name>`    | Execute workflow           |
| `coda preset apply <name>`    | Apply configuration preset |
| `coda test generate`          | Generate tests for code    |

## ⚙️ Configuration

### Configuration Hierarchy

1. Built-in defaults
2. Global config: `~/.coda/config.yaml`
3. Project config: `./.coda/config.yaml`
4. Command line flags (highest priority)

### Example Configuration

```yaml
# ~/.coda/config.yaml
provider: claude-code # Default AI provider
yolo: false # Auto-accept prompts
quiet: false # Suppress info messages

# Safety settings
security:
  auto_scan: true # Scan after each change
  block_on_critical: true # Stop on critical issues

# Cost controls
costs:
  daily_limit: 10.00
  monthly_limit: 200.00
  warning_at: 80 # Warn at 80% of limit

# Workflow
checkpoint:
  auto_create: true # Auto-checkpoint before changes
  keep_last: 10 # Number to retain

# Memory
memory:
  max_size_mb: 100
  eviction_policy: lru # least-recently-used
```

## 🔒 Security Features

Coda automatically scans for:

- Hardcoded passwords and API keys
- SQL injection vulnerabilities
- Cross-site scripting (XSS) risks
- Insecure cryptography
- Path traversal vulnerabilities
- Exposed environment variables

Configure security scanning:

```yaml
security:
  patterns_file: ~/.coda/security-patterns.yaml
  custom_patterns:
    - name: 'AWS Keys'
      pattern: 'AKIA[0-9A-Z]{16}'
      severity: critical
```

## 🤝 Multi-Provider Support

### Switching Providers

```bash
# See available providers
coda switch

# Switch interactively
coda switch --interactive

# Switch to specific provider
coda switch aider

# Use provider for one command
coda --provider gemini "Optimize this algorithm"
```

### Provider Comparison

| Provider       | Best For          | Key Features                         |
| -------------- | ----------------- | ------------------------------------ |
| Claude Code    | Complex reasoning | Deep understanding, multi-file edits |
| Aider          | Git workflows     | Auto-commits, git-aware              |
| Gemini         | Fast responses    | Quick suggestions, image support     |
| GitHub Copilot | Terminal commands | Command explanations                 |
| Cline.ai       | Autonomous tasks  | Multi-step execution                 |

## 🐛 Troubleshooting

### Common Issues

**"Coda command not found"**

```bash
# Check Node.js installation
node --version

# Reinstall Coda
npm install -g coda-cli

# Add to PATH manually (if needed)
export PATH="$PATH:$(npm root -g)/bin"
```

**"AI provider not found"**

```bash
# Check what's available
coda doctor

# Install missing provider
# Example for Aider:
pip install aider-install
```

**"Spending limit reached"**

```bash
# Check current usage
coda costs show --today

# Increase limit temporarily
coda costs set-limit --daily 20

# Use offline mode
coda offline enable
```

## 🤖 Advanced Features

### Custom Workflows

Create `.coda/workflows/deploy.yaml`:

```yaml
name: 'Safe Deployment'
steps:
  - checkpoint: 'pre-deploy'
  - security_scan:
      fail_on: ['critical', 'high']
  - test:
      coverage_threshold: 80
  - command: 'npm run build'
  - command: 'npm run deploy'
  - notification: 'Deployment complete!'
```

### MCP Server Integration

```yaml
# Add to config.yaml
mcp_servers:
  postgres:
    command: 'npx'
    args: ['@modelcontextprotocol/server-postgres']
    env:
      DATABASE_URL: 'postgresql://localhost/mydb'
```

## 📊 Statistics & Monitoring

```bash
# View usage statistics
coda stats

# Monitor in real-time
coda monitor

# Export metrics
coda stats export --format json > metrics.json
```

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Setup development environment
git clone https://github.com/gnanirahulnutakki/coda
cd coda
npm install
npm test
```

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔗 Resources

- [Complete User Guide](docs/CODA_COMPLETE_USER_GUIDE.md)
- [API Documentation](docs/API.md)
- [Security Patterns](docs/SECURITY_PATTERNS.md)
- [Issue Tracker](https://github.com/gnanirahulnutakki/coda/issues)
- [Discussions](https://github.com/gnanirahulnutakki/coda/discussions)

## 🙏 Acknowledgments

Built with inspiration from:

- [Claude Code](https://claude.ai) by Anthropic
- [Aider](https://aider.chat) by Paul Gauthier
- [Continue.dev](https://continue.dev) team
- The amazing AI coding community

---

<p align="center">
Made with ❤️ to make AI coding safe and accessible for everyone
</p>

<p align="center">
<a href="https://github.com/gnanirahulnutakki/coda">GitHub</a> •
<a href="https://npmjs.com/package/coda-cli">NPM</a> •
<a href="https://github.com/gnanirahulnutakki/coda/discussions">Community</a>
</p>
