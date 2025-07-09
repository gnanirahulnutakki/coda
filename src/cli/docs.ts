import { DocumentationIndexer } from '../features/documentation-index.js'
import { log, warn } from '../utils/logging.js'
import * as path from 'path'
import * as fs from 'fs'

export async function handleDocsCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command) {
    console.log('Documentation indexing commands:')
    console.log('  coda docs index [--force] [files...]        - Index documentation files')
    console.log('  coda docs search <query> [--limit=10]       - Search through documentation')
    console.log('  coda docs stats                             - Show index statistics')
    console.log('  coda docs rebuild                           - Rebuild entire index')
    console.log('  coda docs remove <file>                     - Remove file from index')
    console.log('  coda docs export <file>                     - Export index to file')
    console.log('  coda docs import <file>                     - Import index from file')
    console.log('  coda docs similar <file> <line>             - Find similar content')
    return
  }

  const indexer = new DocumentationIndexer()
  await indexer.initializeProject(process.cwd())

  switch (command) {
    case 'index':
      await indexDocumentation(indexer, args.slice(1))
      break
    case 'search':
      await searchDocumentation(indexer, args.slice(1))
      break
    case 'stats':
      await showStats(indexer)
      break
    case 'rebuild':
      await rebuildIndex(indexer)
      break
    case 'remove':
      await removeFile(indexer, args[1])
      break
    case 'export':
      await exportIndex(indexer, args[1])
      break
    case 'import':
      await importIndex(indexer, args[1])
      break
    case 'similar':
      await findSimilar(indexer, args[1], args[2])
      break
    default:
      warn(`Unknown docs command: ${command}`)
      break
  }
}

async function indexDocumentation(indexer: DocumentationIndexer, args: string[]): Promise<void> {
  const force = args.includes('--force')
  const files = args.filter(arg => !arg.startsWith('--'))
  
  try {
    console.log('🔍 Scanning for documentation files...')
    
    const options: { force?: boolean; files?: string[] } = { force }
    if (files.length > 0) {
      // Validate that specified files exist
      const existingFiles = files.filter(file => fs.existsSync(file))
      const missingFiles = files.filter(file => !fs.existsSync(file))
      
      if (missingFiles.length > 0) {
        warn(`Warning: Some files do not exist: ${missingFiles.join(', ')}`)
      }
      
      if (existingFiles.length === 0) {
        warn('No valid files found to index')
        return
      }
      
      options.files = existingFiles
    }
    
    const result = await indexer.indexDocumentation(options)
    
    if (result.indexed === 0 && result.updated === 0 && result.errors === 0) {
      log('📚 No new documentation files to index')
    } else {
      log(`✅ Documentation indexing complete:`)
      if (result.indexed > 0) {
        log(`   📄 Indexed: ${result.indexed} new files`)
      }
      if (result.updated > 0) {
        log(`   🔄 Updated: ${result.updated} files`)
      }
      if (result.errors > 0) {
        warn(`   ❌ Errors: ${result.errors} files failed`)
      }
    }
    
    const stats = indexer.getIndexStats()
    log(`📊 Total: ${stats.totalFiles} files, ${stats.totalChunks} chunks`)
    
  } catch (error) {
    warn(`Failed to index documentation: ${error.message}`)
  }
}

async function searchDocumentation(indexer: DocumentationIndexer, args: string[]): Promise<void> {
  if (args.length === 0) {
    warn('Please provide a search query')
    return
  }
  
  const query = args.filter(arg => !arg.startsWith('--')).join(' ')
  const limitArg = args.find(arg => arg.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10
  
  if (limitArg && (isNaN(limit) || limit <= 0)) {
    warn('Limit must be a positive number')
    return
  }
  
  try {
    const results = indexer.search(query, { limit })
    
    if (results.length === 0) {
      console.log(`🔍 No results found for: "${query}"`)
      return
    }
    
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║             Documentation Search Results            ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[32m🔍 Found ${results.length} results for "${query}":\\x1b[0m\\n`)
    
    results.forEach((result, index) => {
      const score = Math.round(result.score * 100)
      const { chunk } = result
      
      console.log(`${index + 1}. \\x1b[33m${chunk.metadata.file}\\x1b[0m (Lines ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd}) - \\x1b[32m${score}% match\\x1b[0m`)
      
      // Show context if available
      if (result.context.before) {
        console.log(`\\x1b[90m   ${result.context.before.replace(/\\n/g, '\\n   ')}\\x1b[0m`)
      }
      
      // Show the main content with limited length
      const content = chunk.content.length > 200 
        ? chunk.content.substring(0, 200) + '...'
        : chunk.content
      console.log(`   ${content.replace(/\\n/g, '\\n   ')}`)
      
      // Show context if available
      if (result.context.after) {
        console.log(`\\x1b[90m   ${result.context.after.replace(/\\n/g, '\\n   ')}\\x1b[0m`)
      }
      
      console.log()
    })
    
  } catch (error) {
    warn(`Failed to search documentation: ${error.message}`)
  }
}

async function showStats(indexer: DocumentationIndexer): Promise<void> {
  try {
    const stats = indexer.getIndexStats()
    
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║            Documentation Index Statistics           ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[33mOverview:\\x1b[0m`)
    console.log(`  📄 Total Files: ${stats.totalFiles}`)
    console.log(`  📝 Total Chunks: ${stats.totalChunks}`)
    console.log(`  📅 Last Updated: ${new Date(stats.lastUpdated).toLocaleString()}`)
    
    if (Object.keys(stats.filesByType).length > 0) {
      console.log(`\\n\\x1b[33mFiles by Type:\\x1b[0m`)
      Object.entries(stats.filesByType)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count} files`)
        })
    }
    
    if (stats.largestFiles.length > 0) {
      console.log(`\\n\\x1b[33mLargest Files (by chunks):\\x1b[0m`)
      stats.largestFiles.slice(0, 5).forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.file} (${file.chunks} chunks)`)
      })
    }
    
  } catch (error) {
    warn(`Failed to get index statistics: ${error.message}`)
  }
}

async function rebuildIndex(indexer: DocumentationIndexer): Promise<void> {
  try {
    console.log('🔄 Rebuilding documentation index...')
    
    const result = await indexer.rebuildIndex()
    
    log(`✅ Index rebuilt successfully:`)
    log(`   📄 Indexed: ${result.indexed} files`)
    if (result.errors > 0) {
      warn(`   ❌ Errors: ${result.errors} files failed`)
    }
    
    const stats = indexer.getIndexStats()
    log(`📊 Total: ${stats.totalFiles} files, ${stats.totalChunks} chunks`)
    
  } catch (error) {
    warn(`Failed to rebuild index: ${error.message}`)
  }
}

async function removeFile(indexer: DocumentationIndexer, filePath?: string): Promise<void> {
  if (!filePath) {
    warn('Please provide a file path to remove')
    return
  }
  
  try {
    const removed = indexer.removeFile(filePath)
    
    if (removed) {
      log(`✅ Removed ${filePath} from index`)
    } else {
      warn(`File ${filePath} not found in index`)
    }
    
  } catch (error) {
    warn(`Failed to remove file: ${error.message}`)
  }
}

async function exportIndex(indexer: DocumentationIndexer, outputPath?: string): Promise<void> {
  if (!outputPath) {
    warn('Please provide an output file path')
    return
  }
  
  try {
    await indexer.exportIndex(outputPath)
    log(`✅ Index exported to: ${outputPath}`)
    
  } catch (error) {
    warn(`Failed to export index: ${error.message}`)
  }
}

async function importIndex(indexer: DocumentationIndexer, inputPath?: string): Promise<void> {
  if (!inputPath) {
    warn('Please provide an input file path')
    return
  }
  
  try {
    await indexer.importIndex(inputPath)
    log(`✅ Index imported from: ${inputPath}`)
    
    const stats = indexer.getIndexStats()
    log(`📊 Imported: ${stats.totalFiles} files, ${stats.totalChunks} chunks`)
    
  } catch (error) {
    warn(`Failed to import index: ${error.message}`)
  }
}

async function findSimilar(indexer: DocumentationIndexer, filePath?: string, lineStr?: string): Promise<void> {
  if (!filePath) {
    warn('Please provide a file path')
    return
  }
  
  if (!lineStr) {
    warn('Please provide a line number')
    return
  }
  
  const lineNumber = parseInt(lineStr, 10)
  if (isNaN(lineNumber) || lineNumber <= 0) {
    warn('Line number must be a positive integer')
    return
  }
  
  try {
    const stats = indexer.getIndexStats()
    if (stats.totalChunks === 0) {
      warn('No documentation indexed yet. Run "coda docs index" first.')
      return
    }
    
    // Find the chunk that contains the specified line
    const relativePath = path.relative(process.cwd(), filePath)
    const searchResults = indexer.search(`file:${relativePath}`)
    
    let targetChunk = null
    for (const result of searchResults) {
      const chunk = result.chunk
      if (chunk.metadata.file === relativePath && 
          lineNumber >= chunk.metadata.lineStart && 
          lineNumber <= chunk.metadata.lineEnd) {
        targetChunk = chunk
        break
      }
    }
    
    if (!targetChunk) {
      warn(`No indexed content found for ${filePath} at line ${lineNumber}`)
      warn('Make sure the file is indexed and the line number is valid')
      return
    }
    
    const similarChunks = indexer.findSimilarChunks(targetChunk, 5)
    
    if (similarChunks.length === 0) {
      console.log(`No similar content found for ${filePath}:${lineNumber}`)
      return
    }
    
    console.log(`\\x1b[36m╔══════════════════════════════════════════════════════╗\\x1b[0m`)
    console.log(`\\x1b[36m║                 Similar Content                      ║\\x1b[0m`)
    console.log(`\\x1b[36m╚══════════════════════════════════════════════════════╝\\x1b[0m\\n`)
    
    console.log(`\\x1b[33mFound ${similarChunks.length} similar chunks for ${relativePath}:${lineNumber}:\\x1b[0m\\n`)
    
    similarChunks.forEach((result, index) => {
      const score = Math.round(result.score * 100)
      const { chunk } = result
      
      console.log(`${index + 1}. \\x1b[33m${chunk.metadata.file}\\x1b[0m (Lines ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd}) - \\x1b[32m${score}% similar\\x1b[0m`)
      
      const content = chunk.content.length > 150 
        ? chunk.content.substring(0, 150) + '...'
        : chunk.content
      console.log(`   ${content.replace(/\\n/g, '\\n   ')}`)
      console.log()
    })
    
  } catch (error) {
    warn(`Failed to find similar content: ${error.message}`)
  }
}