import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import * as crypto from 'crypto'
import { z } from 'zod'
import { CONFIG_PATHS } from '../config/paths.js'
import { appConfigSchema } from '../config/schemas.js'
import type { AppConfig } from '../config/schemas.js'

export interface SettingsBundle {
  version: string
  exported: string
  checksum: string
  config: AppConfig
  presets?: any[]
  workflows?: any[]
  metadata?: {
    exportedBy?: string
    description?: string
    platform?: string
    nodeVersion?: string
  }
}

export interface ImportOptions {
  overwrite?: boolean
  merge?: boolean
  includePresets?: boolean
  includeWorkflows?: boolean
  validate?: boolean
}

export class SettingsManager {
  private configDir: string

  constructor() {
    this.configDir = CONFIG_PATHS.getConfigDirectory()
  }

  /**
   * Export all settings to a bundle file
   */
  async exportSettings(
    outputPath: string,
    options: {
      includePresets?: boolean
      includeWorkflows?: boolean
      description?: string
    } = {},
  ): Promise<void> {
    const bundle: SettingsBundle = {
      version: '1.0.0',
      exported: new Date().toISOString(),
      checksum: '',
      config: await this.loadConfig(),
      metadata: {
        exportedBy: process.env.USER || 'unknown',
        description: options.description,
        platform: process.platform,
        nodeVersion: process.version,
      },
    }

    // Include presets if requested
    if (options.includePresets !== false) {
      bundle.presets = await this.loadPresets()
    }

    // Include workflows if requested
    if (options.includeWorkflows !== false) {
      bundle.workflows = await this.loadWorkflows()
    }

    // Calculate checksum
    const content = JSON.stringify(bundle, null, 2)
    bundle.checksum = crypto.createHash('sha256').update(content).digest('hex')

    // Write to file
    const finalContent = JSON.stringify(bundle, null, 2)
    fs.writeFileSync(outputPath, finalContent)
  }

  /**
   * Import settings from a bundle file
   */
  async importSettings(
    inputPath: string,
    options: ImportOptions = {},
  ): Promise<{
    success: boolean
    imported: {
      config: boolean
      presets: number
      workflows: number
    }
    errors: string[]
  }> {
    const errors: string[] = []
    const result = {
      success: true,
      imported: {
        config: false,
        presets: 0,
        workflows: 0,
      },
      errors,
    }

    try {
      // Read and parse bundle
      const content = fs.readFileSync(inputPath, 'utf8')
      const bundle = JSON.parse(content) as SettingsBundle

      // Verify checksum if present
      if (bundle.checksum && options.validate !== false) {
        const bundleWithoutChecksum = { ...bundle, checksum: '' }
        const calculatedChecksum = crypto
          .createHash('sha256')
          .update(JSON.stringify(bundleWithoutChecksum, null, 2))
          .digest('hex')

        if (calculatedChecksum !== bundle.checksum) {
          errors.push('Checksum verification failed. Bundle may be corrupted.')
          result.success = false
          return result
        }
      }

      // Import configuration
      if (bundle.config) {
        try {
          await this.importConfig(bundle.config, options)
          result.imported.config = true
        } catch (error) {
          errors.push(`Failed to import config: ${error.message}`)
        }
      }

      // Import presets
      if (bundle.presets && options.includePresets !== false) {
        const count = await this.importPresets(bundle.presets, options)
        result.imported.presets = count
      }

      // Import workflows
      if (bundle.workflows && options.includeWorkflows !== false) {
        const count = await this.importWorkflows(bundle.workflows, options)
        result.imported.workflows = count
      }
    } catch (error) {
      errors.push(`Failed to import settings: ${error.message}`)
      result.success = false
    }

    result.errors = errors
    return result
  }

  /**
   * Backup current settings
   */
  async backupSettings(): Promise<string> {
    const backupDir = path.join(this.configDir, 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupDir, `settings-backup-${timestamp}.json`)

    await this.exportSettings(backupPath, {
      includePresets: true,
      includeWorkflows: true,
      description: 'Automatic backup before import',
    })

    return backupPath
  }

  /**
   * List available backups
   */
  listBackups(): Array<{
    filename: string
    path: string
    size: number
    created: Date
  }> {
    const backupDir = path.join(this.configDir, 'backups')

    if (!fs.existsSync(backupDir)) {
      return []
    }

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('settings-backup-') && f.endsWith('.json'))
      .map((filename) => {
        const filepath = path.join(backupDir, filename)
        const stats = fs.statSync(filepath)

        return {
          filename,
          path: filepath,
          size: stats.size,
          created: stats.birthtime,
        }
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime())

    return files
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath: string, options: ImportOptions = {}): Promise<any> {
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found')
    }

    return this.importSettings(backupPath, options)
  }

  /**
   * Validate settings bundle
   */
  validateBundle(bundlePath: string): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      const content = fs.readFileSync(bundlePath, 'utf8')
      const bundle = JSON.parse(content) as SettingsBundle

      // Check version
      if (!bundle.version) {
        errors.push('Missing version field')
      }

      // Validate config if present
      if (bundle.config) {
        try {
          appConfigSchema.parse(bundle.config)
        } catch (error) {
          errors.push(`Invalid configuration: ${error.message}`)
        }
      }

      // Check for unknown fields
      const knownFields = [
        'version',
        'exported',
        'checksum',
        'config',
        'presets',
        'workflows',
        'metadata',
      ]
      const unknownFields = Object.keys(bundle).filter((k) => !knownFields.includes(k))

      if (unknownFields.length > 0) {
        warnings.push(`Unknown fields in bundle: ${unknownFields.join(', ')}`)
      }

      // Check metadata
      if (bundle.metadata?.platform && bundle.metadata.platform !== process.platform) {
        warnings.push(
          `Bundle was exported on ${bundle.metadata.platform}, current platform is ${process.platform}`,
        )
      }
    } catch (error) {
      errors.push(`Failed to parse bundle: ${error.message}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  // Private helper methods

  private async loadConfig(): Promise<AppConfig> {
    const configPath = path.join(this.configDir, 'config.yaml')

    if (!fs.existsSync(configPath)) {
      throw new Error('No configuration file found')
    }

    const content = fs.readFileSync(configPath, 'utf8')
    return yaml.parse(content) as AppConfig
  }

  private async importConfig(config: AppConfig, options: ImportOptions): Promise<void> {
    const configPath = path.join(this.configDir, 'config.yaml')

    // Validate config
    const validationResult = appConfigSchema.safeParse(config)
    if (!validationResult.success) {
      throw new Error(`Invalid configuration: ${validationResult.error.message}`)
    }

    if (options.merge && fs.existsSync(configPath)) {
      // Merge with existing config
      const existingContent = fs.readFileSync(configPath, 'utf8')
      const existingConfig = yaml.parse(existingContent) as AppConfig

      const mergedConfig = {
        ...existingConfig,
        ...config,
      }

      fs.writeFileSync(configPath, yaml.stringify(mergedConfig))
    } else {
      // Overwrite config
      fs.writeFileSync(configPath, yaml.stringify(config))
    }
  }

  private async loadPresets(): Promise<any[]> {
    const presetsDir = path.join(this.configDir, 'presets')
    const presets: any[] = []

    if (fs.existsSync(presetsDir)) {
      const files = fs
        .readdirSync(presetsDir)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(presetsDir, file), 'utf8')
          const preset = yaml.parse(content)
          if (!preset.isBuiltIn) {
            presets.push(preset)
          }
        } catch (error) {
          // Skip invalid preset files
        }
      }
    }

    return presets
  }

  private async importPresets(presets: any[], options: ImportOptions): Promise<number> {
    const presetsDir = path.join(this.configDir, 'presets')

    if (!fs.existsSync(presetsDir)) {
      fs.mkdirSync(presetsDir, { recursive: true })
    }

    let imported = 0

    for (const preset of presets) {
      if (!preset.id || preset.isBuiltIn) continue

      const filename = `${preset.id}.yaml`
      const filepath = path.join(presetsDir, filename)

      if (!options.overwrite && fs.existsSync(filepath)) {
        continue
      }

      try {
        fs.writeFileSync(filepath, yaml.stringify(preset))
        imported++
      } catch (error) {
        // Skip failed imports
      }
    }

    return imported
  }

  private async loadWorkflows(): Promise<any[]> {
    const workflowsDir = path.join(this.configDir, 'workflows')
    const workflows: any[] = []

    if (fs.existsSync(workflowsDir)) {
      const files = fs
        .readdirSync(workflowsDir)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8')
          const workflow = yaml.parse(content)
          workflows.push(workflow)
        } catch (error) {
          // Skip invalid workflow files
        }
      }
    }

    return workflows
  }

  private async importWorkflows(workflows: any[], options: ImportOptions): Promise<number> {
    const workflowsDir = path.join(this.configDir, 'workflows')

    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true })
    }

    let imported = 0

    for (const workflow of workflows) {
      if (!workflow.id) continue

      const filename = `${workflow.id}.yaml`
      const filepath = path.join(workflowsDir, filename)

      if (!options.overwrite && fs.existsSync(filepath)) {
        continue
      }

      try {
        fs.writeFileSync(filepath, yaml.stringify(workflow))
        imported++
      } catch (error) {
        // Skip failed imports
      }
    }

    return imported
  }
}
