import * as fs from 'fs'
import * as path from 'path'
import { SettingsManager } from '../features/settings-manager.js'
import { log, warn } from '../utils/logging.js'

function printHelp(): void {
  console.log(`
Settings Import/Export Management

Usage: coda settings <command> [options]

Commands:
  export <file>              Export all settings to a bundle file
  import <file>              Import settings from a bundle file
  validate <file>            Validate a settings bundle file
  backup                     Create a backup of current settings
  backups                    List available backups
  restore <backup>           Restore settings from a backup

Options:
  --include-presets          Include configuration presets in export (default: true)
  --include-workflows        Include workflow templates in export (default: true)
  --description <text>       Add description to export
  --overwrite                Overwrite existing files when importing
  --merge                    Merge with existing configuration instead of replacing
  --no-validate              Skip checksum validation when importing

Examples:
  coda settings export my-settings.json
  coda settings export backup.json --description "Before major changes"
  coda settings import shared-settings.json --merge
  coda settings backup
  coda settings restore settings-backup-2024-01-01T12-00-00-000Z.json
`)
}

async function exportSettings(manager: SettingsManager, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Please provide an output file path')
    warn('Usage: coda settings export <file>')
    return
  }

  const outputPath = args[0]
  
  // Parse options
  const options: any = {
    includePresets: !args.includes('--no-presets'),
    includeWorkflows: !args.includes('--no-workflows')
  }

  const descIndex = args.indexOf('--description')
  if (descIndex !== -1 && args[descIndex + 1]) {
    options.description = args[descIndex + 1]
  }

  try {
    await manager.exportSettings(outputPath, options)
    
    log(`✅ Settings exported successfully to: ${outputPath}`)
    
    const stats = fs.statSync(outputPath)
    log(`   📦 File size: ${(stats.size / 1024).toFixed(2)} KB`)
    
    if (options.includePresets !== false) {
      log('   📋 Included: Configuration presets')
    }
    if (options.includeWorkflows !== false) {
      log('   📋 Included: Workflow templates')
    }
    
  } catch (error) {
    warn(`Failed to export settings: ${error.message}`)
  }
}

async function importSettings(manager: SettingsManager, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Please provide an input file path')
    warn('Usage: coda settings import <file>')
    return
  }

  const inputPath = args[0]
  
  if (!fs.existsSync(inputPath)) {
    warn(`File not found: ${inputPath}`)
    return
  }

  const options = {
    overwrite: args.includes('--overwrite'),
    merge: args.includes('--merge'),
    includePresets: !args.includes('--no-presets'),
    includeWorkflows: !args.includes('--no-workflows'),
    validate: !args.includes('--no-validate')
  }

  // Create backup before importing
  if (!args.includes('--no-backup')) {
    try {
      const backupPath = await manager.backupSettings()
      log(`📸 Backup created: ${path.basename(backupPath)}`)
    } catch (error) {
      warn(`Failed to create backup: ${error.message}`)
      
      if (!args.includes('--force')) {
        warn('Import cancelled. Use --force to import without backup.')
        return
      }
    }
  }

  try {
    const result = await manager.importSettings(inputPath, options)
    
    if (result.success) {
      log('✅ Settings imported successfully!')
      
      if (result.imported.config) {
        log('   ⚙️  Configuration imported')
      }
      if (result.imported.presets > 0) {
        log(`   📦 ${result.imported.presets} preset(s) imported`)
      }
      if (result.imported.workflows > 0) {
        log(`   🔄 ${result.imported.workflows} workflow(s) imported`)
      }
      
      log('\n🔄 Restart your Coda session for changes to take effect.')
    } else {
      warn('❌ Import failed with errors:')
      result.errors.forEach(err => warn(`   - ${err}`))
    }
    
  } catch (error) {
    warn(`Failed to import settings: ${error.message}`)
  }
}

async function validateBundle(manager: SettingsManager, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Please provide a bundle file path')
    warn('Usage: coda settings validate <file>')
    return
  }

  const bundlePath = args[0]
  
  if (!fs.existsSync(bundlePath)) {
    warn(`File not found: ${bundlePath}`)
    return
  }

  const result = manager.validateBundle(bundlePath)
  
  if (result.valid) {
    log('✅ Bundle is valid!')
  } else {
    warn('❌ Bundle validation failed:')
    result.errors.forEach(err => warn(`   ❌ ${err}`))
  }
  
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:')
    result.warnings.forEach(warning => console.log(`   - ${warning}`))
  }
}

async function createBackup(manager: SettingsManager): Promise<void> {
  try {
    const backupPath = await manager.backupSettings()
    
    log('✅ Backup created successfully!')
    log(`   📦 Location: ${backupPath}`)
    
    const stats = fs.statSync(backupPath)
    log(`   📏 Size: ${(stats.size / 1024).toFixed(2)} KB`)
    
  } catch (error) {
    warn(`Failed to create backup: ${error.message}`)
  }
}

async function listBackups(manager: SettingsManager): Promise<void> {
  const backups = manager.listBackups()
  
  if (backups.length === 0) {
    console.log('No backups found.')
    console.log('Create a backup with: coda settings backup')
    return
  }
  
  console.log(`\nAvailable Backups (${backups.length}):\n`)
  
  backups.forEach((backup, index) => {
    const ageInDays = Math.floor((Date.now() - backup.created.getTime()) / (1000 * 60 * 60 * 24))
    const sizeKB = (backup.size / 1024).toFixed(2)
    
    console.log(`${index + 1}. ${backup.filename}`)
    console.log(`   Created: ${backup.created.toLocaleString()} (${ageInDays} days ago)`)
    console.log(`   Size: ${sizeKB} KB`)
    console.log()
  })
  
  console.log('To restore a backup, use:')
  console.log('  coda settings restore <filename>')
}

async function restoreBackup(manager: SettingsManager, args: string[]): Promise<void> {
  if (args.length < 1) {
    warn('Please provide a backup filename or path')
    warn('Usage: coda settings restore <backup>')
    warn('Use "coda settings backups" to list available backups')
    return
  }

  const backupRef = args[0]
  let backupPath: string
  
  // Check if it's a full path or just a filename
  if (path.isAbsolute(backupRef) || backupRef.includes(path.sep)) {
    backupPath = backupRef
  } else {
    // Look for the backup in the backups directory
    const backups = manager.listBackups()
    const backup = backups.find(b => b.filename === backupRef)
    
    if (!backup) {
      warn(`Backup not found: ${backupRef}`)
      warn('Use "coda settings backups" to list available backups')
      return
    }
    
    backupPath = backup.path
  }

  if (!fs.existsSync(backupPath)) {
    warn(`Backup file not found: ${backupPath}`)
    return
  }

  const options = {
    overwrite: true,
    includePresets: true,
    includeWorkflows: true
  }

  try {
    const result = await manager.restoreBackup(backupPath, options)
    
    if (result.success) {
      log('✅ Settings restored successfully!')
      
      if (result.imported.config) {
        log('   ⚙️  Configuration restored')
      }
      if (result.imported.presets > 0) {
        log(`   📦 ${result.imported.presets} preset(s) restored`)
      }
      if (result.imported.workflows > 0) {
        log(`   🔄 ${result.imported.workflows} workflow(s) restored`)
      }
      
      log('\n🔄 Restart your Coda session for changes to take effect.')
    } else {
      warn('❌ Restore failed with errors:')
      result.errors.forEach(err => warn(`   - ${err}`))
    }
    
  } catch (error) {
    warn(`Failed to restore backup: ${error.message}`)
  }
}

export async function handleSettingsCommand(args: string[]): Promise<void> {
  const command = args[0]
  
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const manager = new SettingsManager()

  try {
    switch (command) {
      case 'export':
        await exportSettings(manager, args.slice(1))
        break

      case 'import':
        await importSettings(manager, args.slice(1))
        break

      case 'validate':
        await validateBundle(manager, args.slice(1))
        break

      case 'backup':
        await createBackup(manager)
        break

      case 'backups':
        await listBackups(manager)
        break

      case 'restore':
        await restoreBackup(manager, args.slice(1))
        break

      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    process.exit(1)
  }
}