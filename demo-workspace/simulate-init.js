#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Coda Demo - Simulating Interactive Experience\n');

// Simulate the initialization process
console.log('$ coda cc-init\n');

// Simulate provider selection
console.log('? Which AI provider would you like to use?');
console.log('  ❯ Claude Code');
console.log('    Gemini\n');

console.log('✓ Selected: Claude Code\n');

// Simulate custom path prompt
console.log('? Enter custom path to claude-code CLI (or press enter to use default):');
console.log('✓ Using default path\n');

// Simulate YOLO mode prompt
console.log('? Would you like to enable YOLO mode? (accepts all prompts automatically)');
console.log('  Use with caution - Claude will perform actions without confirmation');
console.log('✓ No\n');

// Simulate toolset prompt
console.log('? Would you like to enable the core toolset?');
console.log('  Includes MCP context7 tools for library documentation');
console.log('✓ Yes\n');

// Create actual config directory and file
const configDir = path.join(os.homedir(), '.coda');
const configFile = path.join(configDir, 'config.yaml');

const config = `# AI Provider settings
provider: claude-code          # Options: claude-code, gemini

yolo: false                    # Auto-accept all prompts
show_notifications: true       # Desktop notifications
sticky_notifications: false    # Keep notifications on screen
debug: false                   # Debug logging

# Tool management
toolsets:
  - internal:core             # Built-in toolset

# Trusted directories (auto-accept trust prompts)
roots: []

# Safety settings
dangerously_allow_in_dirty_directory: false
dangerously_allow_without_version_control: false
`;

// Create config directory if it doesn't exist
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Write config file
fs.writeFileSync(configFile, config);

console.log(`✅ Created configuration file at ${configFile}`);
console.log('✓ YOLO mode disabled - all prompts will require confirmation');
console.log('✓ Core toolset enabled\n');

// Show the created config
console.log('📄 Configuration file contents:');
console.log('─'.repeat(50));
console.log(config);
console.log('─'.repeat(50));

// Create some example directories
const logsDir = path.join(configDir, 'logs');
const sessionsDir = path.join(configDir, 'sessions');
const historyDir = path.join(configDir, 'history');
const toolsetsDir = path.join(configDir, 'toolsets');

[logsDir, sessionsDir, historyDir, toolsetsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

console.log('\n📁 Created directory structure:');
console.log(`${configDir}/
├── config.yaml
├── logs/
├── sessions/
├── history/
└── toolsets/`);

console.log('\n✨ Coda is now configured and ready to use!');
console.log('\nNext steps:');
console.log('  • Run: coda "explain this code"');
console.log('  • View stats: coda stats');
console.log('  • Enable YOLO mode: coda --yolo "fix this bug"');