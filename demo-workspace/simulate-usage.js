#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('🎯 Coda Usage Demo\n');

// Demo 1: Basic usage
console.log('═══ Demo 1: Basic Usage ═══\n');
console.log('$ coda "explain this error: TypeError: Cannot read property \'x\' of undefined"\n');
console.log('[36m※ Using Claude Code provider[0m');
console.log('[36m※ Ready, Passing off control to Claude CLI[0m');
console.log('\n[Claude would then take over and explain the error...]\n');

// Demo 2: Stats command
console.log('═══ Demo 2: Viewing Statistics ═══\n');
console.log('$ coda stats\n');

// Create some sample history data
const historyDir = path.join(os.homedir(), '.coda', 'history');
const historyFile = path.join(historyDir, 'commands.jsonl');

const sampleHistory = [
  {
    id: "cmd-1720449923123-abc123",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    command: ["explain", "this", "error"],
    cwd: "/Users/demo/projects/my-app",
    exitCode: 0,
    duration: 5234,
    success: true,
    projectName: "my-app"
  },
  {
    id: "cmd-1720446615456-def456",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    command: ["fix", "the", "test"],
    cwd: "/Users/demo/projects/api-server",
    exitCode: 0,
    duration: 12180,
    success: true,
    projectName: "api-server"
  },
  {
    id: "cmd-1720442142789-ghi789",
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    command: ["refactor", "this", "function"],
    cwd: "/Users/demo/projects/frontend-app",
    exitCode: 0,
    duration: 3450,
    success: true,
    projectName: "frontend-app"
  }
];

// Write sample history
if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}
fs.writeFileSync(historyFile, sampleHistory.map(h => JSON.stringify(h)).join('\n'));

// Display stats output
console.log('[36m╔═══════════════════════════════════════════════════════════════╗[0m');
console.log('[36m║                      Coda Statistics                          ║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║[0m Total Commands Run:      3                                    [36m║[0m');
console.log('[36m║[0m Success Rate:            100.0%                               [36m║[0m');
console.log('[36m║[0m Average Duration:        6.9s                                 [36m║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║                    Most Used Commands                         ║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║[0m explain: 1 times                                              [36m║[0m');
console.log('[36m║[0m fix: 1 times                                                  [36m║[0m');
console.log('[36m║[0m refactor: 1 times                                             [36m║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║                   Commands by Project                         ║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║[0m my-app: 1 commands                                            [36m║[0m');
console.log('[36m║[0m api-server: 1 commands                                        [36m║[0m');
console.log('[36m║[0m frontend-app: 1 commands                                      [36m║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║                     Storage Usage                             ║[0m');
console.log('[36m╠═══════════════════════════════════════════════════════════════╣[0m');
console.log('[36m║[0m Config Directory:        2.1 KB                               [36m║[0m');
console.log('[36m║[0m Log Files:               0 B                                  [36m║[0m');
console.log('[36m║[0m Session Records:         0 B                                  [36m║[0m');
console.log('[36m║[0m Total:                   2.1 KB                               [36m║[0m');
console.log('[36m╚═══════════════════════════════════════════════════════════════╝[0m\n');

// Demo 3: YOLO mode
console.log('═══ Demo 3: YOLO Mode ═══\n');
console.log('$ coda --yolo "fix the bug in app.js"\n');
console.log('[36m※ Using Claude Code provider[0m');
console.log('[33m※ YOLO mode enabled - all prompts will be automatically accepted[0m');
console.log('[36m※ Ready, Passing off control to Claude CLI[0m');
console.log('\n[Claude would run with auto-accept enabled...]\n');

// Demo 4: Debug mode
console.log('═══ Demo 4: Debug Mode ═══\n');
console.log('$ coda --debug "why is this test failing?"\n');
console.log('[36m※ Debug mode enabled - verbose logging active[0m');
console.log('[36m※ Using Claude Code provider[0m');
console.log('[DEBUG] Config loaded from /Users/nutakki/.coda/config.yaml');
console.log('[DEBUG] Provider: claude-code');
console.log('[DEBUG] Toolsets: ["internal:core"]');
console.log('[36m※ Ready, Passing off control to Claude CLI[0m\n');

// Demo 5: Project config
console.log('═══ Demo 5: Project-Specific Config ═══\n');
console.log('$ cd my-gemini-project');
console.log('$ cat .coda/config.yaml');
console.log(`
provider: gemini
yolo: true
toolsets:
  - project:api-tools
`);
console.log('$ coda "optimize this database query"\n');
console.log('[36m※ Using Gemini provider[0m');
console.log('[33m※ YOLO mode enabled - all prompts will be automatically accepted[0m');
console.log('[36m※ Ready, Passing off control to Gemini CLI[0m\n');

console.log('💡 Key Features Demonstrated:');
console.log('  ✓ Multi-provider support (Claude Code & Gemini)');
console.log('  ✓ Statistics tracking');
console.log('  ✓ YOLO mode for automation');
console.log('  ✓ Debug mode for troubleshooting');
console.log('  ✓ Project-specific configurations');
console.log('\n✨ Coda enhances your AI coding workflow!');