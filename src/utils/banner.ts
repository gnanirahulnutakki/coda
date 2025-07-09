import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

export function getVersion(): string {
  try {
    const currentFilePath = fileURLToPath(import.meta.url)
    const currentDir = path.dirname(currentFilePath)
    const packageJsonPath = path.resolve(currentDir, '..', '..', 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    return packageJson.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

export function displayWelcomeBanner(provider: string = 'claude-code'): void {
  const version = getVersion()
  const cwd = process.cwd()
  const providerName = provider === 'gemini' ? 'Gemini' : 'Claude Code'
  
  console.log('\x1b[36m╭───────────────────────────────────────────────────────────────────────╮\x1b[0m')
  console.log('\x1b[36m│\x1b[0m \x1b[35m✻\x1b[0m \x1b[1mWelcome to Coda!\x1b[0m                                                     \x1b[36m│\x1b[0m')
  console.log(`\x1b[36m│\x1b[0m   \x1b[2mThe intelligent wrapper for ${providerName}\x1b[0m                         \x1b[36m│\x1b[0m`)
  console.log('\x1b[36m│\x1b[0m                                                                       \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m \x1b[33m📚 Features:\x1b[0m                                                         \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   • Multi-provider support (Claude Code & Gemini)                     \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   • Interactive provider selection                                    \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   • Session recording & statistics                                    \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   • YOLO mode for automation                                          \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   • Toolset & MCP server support                                      \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m                                                                       \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m \x1b[32m🚀 Quick Start:\x1b[0m                                                      \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   \x1b[2mcoda "your prompt"      \x1b[0m - Ask AI a question                      \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   \x1b[2mcoda switch             \x1b[0m - Switch AI provider                      \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   \x1b[2mcoda stats              \x1b[0m - View usage statistics                   \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   \x1b[2mcoda doctor             \x1b[0m - Diagnose setup issues                   \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m   \x1b[2mcoda --help             \x1b[0m - Show all options                        \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m                                                                       \x1b[36m│\x1b[0m')
  console.log(`\x1b[36m│\x1b[0m   \x1b[2mVersion: ${version}  |  cwd: ${cwd.substring(0, 35)}${cwd.length > 35 ? '...' : ''}\x1b[0m`)
  console.log('\x1b[36m│\x1b[0m                                                                       \x1b[36m│\x1b[0m')
  console.log('\x1b[36m│\x1b[0m \x1b[90m📧 Issues or feedback: gnanirn@gmail.com\x1b[0m                            \x1b[36m│\x1b[0m')
  console.log('\x1b[36m╰───────────────────────────────────────────────────────────────────────╯\x1b[0m')
  console.log()
}