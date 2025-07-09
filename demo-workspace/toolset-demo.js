#!/usr/bin/env node

console.log('🛠️  Coda Toolset Demo\n')

console.log('═══ Custom Toolset Example ═══\n')

console.log('$ cat ~/.coda/toolsets/backend.yaml')
console.log(`
# Backend development toolset
allowed:
  - read_file
  - write_file
  - execute_bash
  - list_files
  - search_files
  
disallowed:
  - delete_file  # Prevent accidental deletions

mcp:
  postgres:
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-postgres"]
`)

console.log('\n$ coda --toolset backend "create a database migration"')
console.log('\n[36m※ Using Claude Code provider[0m')
console.log('[36m※ Loading toolset: backend[0m')
console.log('[36m※ MCP server configured: postgres[0m')
console.log('[36m※ Ready, Passing off control to Claude CLI[0m')
console.log('\n[Claude would now have access to PostgreSQL tools and restricted file operations]\n')

console.log('═══ Multiple Toolsets ═══\n')
console.log('$ coda --toolset backend --toolset internal:core "analyze database performance"')
console.log('\n[36m※ Using Claude Code provider[0m')
console.log('[36m※ Loading toolset: backend[0m')
console.log('[36m※ Loading toolset: internal:core[0m')
console.log('[36m※ MCP servers configured: postgres, context7[0m')
console.log('[36m※ Ready, Passing off control to Claude CLI[0m\n')

console.log('💡 Toolset Benefits:')
console.log('  ✓ Control which tools AI can use')
console.log('  ✓ Add MCP servers for specialized functionality')
console.log('  ✓ Mix and match toolsets per task')
console.log('  ✓ Project-specific tool configurations')
