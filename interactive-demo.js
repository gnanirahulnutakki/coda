#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('=== Coda Interactive Demo ===\n');

async function runCommand(cmd, args = [], description) {
  console.log(`${description}:`);
  console.log('-'.repeat(50));
  
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('exit', (code) => {
      console.log('\n');
      resolve(code);
    });
  });
}

async function main() {
  const codaPath = path.join(__dirname, 'dist', 'cli.js');
  
  // Show help
  await runCommand('node', [codaPath, '--help'], '1. Help Menu');
  
  // Show version
  await runCommand('node', [codaPath, '--version'], '2. Version Info');
  
  // Show stats help
  await runCommand('node', [codaPath, 'stats', '--help'], '3. Stats Command Help');
  
  // Show cc-init help
  await runCommand('node', [codaPath, 'cc-init', '--help'], '4. Init Command Help');
  
  console.log('Demo complete!');
}

main().catch(console.error);