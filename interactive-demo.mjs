#!/usr/bin/env node

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('=== Coda Interactive Demo ===\n')

async function runCommand(cmd, args = [], description) {
  console.log(`${description}:`)
  console.log('-'.repeat(50))

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
    })

    child.on('exit', (code) => {
      console.log('\n')
      resolve(code)
    })
  })
}

async function main() {
  const codaPath = path.join(__dirname, 'dist', 'cli.js')

  // Show help
  await runCommand('node', [codaPath, '--help'], '1. Help Menu')

  // Show version
  await runCommand('node', [codaPath, '--version'], '2. Version Info')

  // Show stats help
  await runCommand('node', [codaPath, 'stats', '--help'], '3. Stats Command Help')

  // Show cc-init help
  await runCommand('node', [codaPath, 'cc-init', '--help'], '4. Init Command Help')

  console.log('Demo complete!')
}

main().catch(console.error)
