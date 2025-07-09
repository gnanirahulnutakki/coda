import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { fileURLToPath } from 'url'
import { CONFIG_PATHS } from '../config/paths.js'
import { loadConfigFile } from '../config/loader.js'
import type { AppConfig } from '../config/schemas.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ConfigPreset {
  id: string
  name: string
  description: string
  category: 'general' | 'project' | 'workflow' | 'security' | 'custom'
  tags: string[]
  config: Partial<AppConfig>
  created: string
  updated: string
  author?: string
  version?: string
  isBuiltIn?: boolean
}

export interface PresetMetadata {
  totalPresets: number
  categories: Record<string, number>
  lastUsed?: string
  favorites: string[]
}

export class PresetManager {
  private presetsDir: string
  private builtInPresetsDir: string
  private metadataFile: string
  private presets: Map<string, ConfigPreset> = new Map()
  private metadata: PresetMetadata

  constructor() {
    this.presetsDir = path.join(CONFIG_PATHS.getConfigDirectory(), 'presets')
    this.builtInPresetsDir = path.join(__dirname, '..', 'presets')
    this.metadataFile = path.join(this.presetsDir, 'metadata.json')

    this.ensureDirectories()
    this.loadMetadata()
    this.loadBuiltInPresets()
    this.loadCustomPresets()

    this.metadata = {
      totalPresets: this.presets.size,
      categories: this.getCategoryCount(),
      favorites: this.metadata?.favorites || [],
      lastUsed: this.metadata?.lastUsed,
    }
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.presetsDir)) {
      fs.mkdirSync(this.presetsDir, { recursive: true })
    }
  }

  private loadMetadata(): void {
    if (fs.existsSync(this.metadataFile)) {
      try {
        this.metadata = JSON.parse(fs.readFileSync(this.metadataFile, 'utf8'))
      } catch (error) {
        this.metadata = {
          totalPresets: 0,
          categories: {},
          favorites: [],
        }
      }
    } else {
      this.metadata = {
        totalPresets: 0,
        categories: {},
        favorites: [],
      }
    }
  }

  private saveMetadata(): void {
    this.metadata.totalPresets = this.presets.size
    this.metadata.categories = this.getCategoryCount()
    fs.writeFileSync(this.metadataFile, JSON.stringify(this.metadata, null, 2))
  }

  private getCategoryCount(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const preset of this.presets.values()) {
      counts[preset.category] = (counts[preset.category] || 0) + 1
    }
    return counts
  }

  private loadBuiltInPresets(): void {
    // Define built-in presets
    const builtInPresets: ConfigPreset[] = [
      {
        id: 'minimal',
        name: 'Minimal',
        description: 'Minimal configuration with basic features',
        category: 'general',
        tags: ['simple', 'basic'],
        config: {
          yolo: false,
          show_notifications: false,
          log_all_pattern_matches: false,
          allow_buffer_snapshots: false,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
      {
        id: 'productive',
        name: 'Productive',
        description: 'Optimized for productivity with auto-acceptance and minimal interruptions',
        category: 'workflow',
        tags: ['productivity', 'fast', 'yolo'],
        config: {
          yolo: true,
          show_notifications: false,
          sticky_notifications: false,
          dangerously_suppress_yolo_confirmation: true,
          allow_buffer_snapshots: true,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
      {
        id: 'cautious',
        name: 'Cautious',
        description: 'Maximum safety with all confirmations and notifications',
        category: 'security',
        tags: ['safe', 'careful', 'secure'],
        config: {
          yolo: false,
          show_notifications: true,
          sticky_notifications: true,
          log_all_pattern_matches: true,
          dangerously_allow_in_dirty_directory: false,
          dangerously_allow_without_version_control: false,
          dangerously_allow_in_untrusted_root: false,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
      {
        id: 'debug',
        name: 'Debug Mode',
        description: 'Verbose logging and debugging features enabled',
        category: 'general',
        tags: ['debug', 'verbose', 'troubleshooting'],
        config: {
          debug: true,
          log_all_pattern_matches: true,
          allow_buffer_snapshots: true,
          show_notifications: true,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
      {
        id: 'ci-friendly',
        name: 'CI/CD Friendly',
        description: 'Configuration suitable for continuous integration environments',
        category: 'workflow',
        tags: ['ci', 'cd', 'automation'],
        config: {
          yolo: true,
          show_notifications: false,
          quiet: true,
          dangerously_suppress_yolo_confirmation: true,
          dangerously_allow_in_dirty_directory: true,
          dangerously_allow_without_version_control: true,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
      {
        id: 'team-collab',
        name: 'Team Collaboration',
        description: 'Balanced settings for team development',
        category: 'project',
        tags: ['team', 'collaboration', 'balanced'],
        config: {
          yolo: false,
          show_notifications: true,
          sticky_notifications: false,
          log_all_pattern_matches: false,
          allow_buffer_snapshots: true,
          dangerously_allow_in_dirty_directory: false,
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        isBuiltIn: true,
      },
    ]

    // Load built-in presets
    for (const preset of builtInPresets) {
      this.presets.set(preset.id, preset)
    }
  }

  private loadCustomPresets(): void {
    if (!fs.existsSync(this.presetsDir)) {
      return
    }

    const files = fs
      .readdirSync(this.presetsDir)
      .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.presetsDir, file), 'utf8')
        const preset = yaml.parse(content) as ConfigPreset

        if (this.validatePreset(preset)) {
          preset.isBuiltIn = false
          this.presets.set(preset.id, preset)
        }
      } catch (error) {
        console.warn(`Failed to load preset ${file}:`, error.message)
      }
    }
  }

  private validatePreset(preset: any): preset is ConfigPreset {
    return (
      preset &&
      typeof preset.id === 'string' &&
      typeof preset.name === 'string' &&
      typeof preset.config === 'object' &&
      preset.config !== null
    )
  }

  /**
   * Get all available presets
   */
  getPresets(category?: string): ConfigPreset[] {
    const presets = Array.from(this.presets.values())

    if (category) {
      return presets.filter((p) => p.category === category)
    }

    return presets
  }

  /**
   * Get a specific preset by ID
   */
  getPreset(id: string): ConfigPreset | null {
    return this.presets.get(id) || null
  }

  /**
   * Search presets by name, description, or tags
   */
  searchPresets(query: string): ConfigPreset[] {
    const lowerQuery = query.toLowerCase()

    return Array.from(this.presets.values()).filter(
      (preset) =>
        preset.name.toLowerCase().includes(lowerQuery) ||
        preset.description.toLowerCase().includes(lowerQuery) ||
        preset.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
    )
  }

  /**
   * Create a new custom preset
   */
  createPreset(data: {
    name: string
    description: string
    category?: ConfigPreset['category']
    tags?: string[]
    config: Partial<AppConfig>
    author?: string
  }): ConfigPreset {
    // Validate input data
    if (!data.name || data.name.trim() === '') {
      throw new Error('Preset name is required')
    }

    const id = this.generatePresetId(data.name)

    const preset: ConfigPreset = {
      id,
      name: data.name,
      description: data.description,
      category: data.category || 'custom',
      tags: data.tags || [],
      config: data.config,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      author: data.author,
      isBuiltIn: false,
    }

    // Validate config
    if (!this.validatePreset(preset)) {
      throw new Error('Invalid preset configuration')
    }

    // Save to file
    const filename = `${id}.yaml`
    const filepath = path.join(this.presetsDir, filename)
    fs.writeFileSync(filepath, yaml.stringify(preset))

    // Add to memory
    this.presets.set(id, preset)
    this.saveMetadata()

    return preset
  }

  /**
   * Update an existing custom preset
   */
  updatePreset(id: string, updates: Partial<ConfigPreset>): ConfigPreset {
    const preset = this.presets.get(id)

    if (!preset) {
      throw new Error(`Preset ${id} not found`)
    }

    if (preset.isBuiltIn) {
      throw new Error('Cannot modify built-in presets')
    }

    const updated = {
      ...preset,
      ...updates,
      id: preset.id, // Prevent ID change
      updated: new Date().toISOString(),
      isBuiltIn: false,
    }

    // Validate
    if (!this.validatePreset(updated)) {
      throw new Error('Invalid preset configuration')
    }

    // Save to file
    const filename = `${id}.yaml`
    const filepath = path.join(this.presetsDir, filename)
    fs.writeFileSync(filepath, yaml.stringify(updated))

    // Update in memory
    this.presets.set(id, updated)
    this.saveMetadata()

    return updated
  }

  /**
   * Delete a custom preset
   */
  deletePreset(id: string): boolean {
    const preset = this.presets.get(id)

    if (!preset) {
      return false
    }

    if (preset.isBuiltIn) {
      throw new Error('Cannot delete built-in presets')
    }

    // Delete file
    const filename = `${id}.yaml`
    const filepath = path.join(this.presetsDir, filename)

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath)
    }

    // Remove from memory
    this.presets.delete(id)

    // Remove from favorites if present
    this.metadata.favorites = this.metadata.favorites.filter((fav) => fav !== id)
    this.saveMetadata()

    return true
  }

  /**
   * Apply a preset to the current configuration
   */
  async applyPreset(id: string): Promise<void> {
    const preset = this.presets.get(id)

    if (!preset) {
      throw new Error(`Preset ${id} not found`)
    }

    // Load current config
    const currentConfig = await loadConfigFile()

    // Merge preset config with current config
    const mergedConfig = {
      ...currentConfig,
      ...preset.config,
    }

    // Save to config file
    const configPath = path.join(CONFIG_PATHS.getConfigDirectory(), 'config.yaml')
    fs.writeFileSync(configPath, yaml.stringify(mergedConfig))

    // Update metadata
    this.metadata.lastUsed = id
    this.saveMetadata()
  }

  /**
   * Create a preset from current configuration
   */
  async createFromCurrent(
    name: string,
    description: string,
    options: {
      category?: ConfigPreset['category']
      tags?: string[]
      author?: string
    } = {},
  ): Promise<ConfigPreset> {
    const currentConfig = await loadConfigFile()

    return this.createPreset({
      name,
      description,
      config: currentConfig,
      ...options,
    })
  }

  /**
   * Export a preset
   */
  exportPreset(id: string, outputPath: string): void {
    const preset = this.presets.get(id)

    if (!preset) {
      throw new Error(`Preset ${id} not found`)
    }

    // Remove internal fields for export
    const exportData = {
      ...preset,
      isBuiltIn: undefined,
    }

    fs.writeFileSync(outputPath, yaml.stringify(exportData))
  }

  /**
   * Import a preset
   */
  importPreset(inputPath: string): ConfigPreset {
    if (!fs.existsSync(inputPath)) {
      throw new Error('Import file not found')
    }

    const content = fs.readFileSync(inputPath, 'utf8')
    const preset = yaml.parse(content) as ConfigPreset

    // Generate new ID if it conflicts
    if (this.presets.has(preset.id)) {
      preset.id = this.generatePresetId(preset.name)
    }

    // Update timestamps
    preset.created = preset.created || new Date().toISOString()
    preset.updated = new Date().toISOString()
    preset.isBuiltIn = false

    // Validate
    if (!this.validatePreset(preset)) {
      throw new Error('Invalid preset file')
    }

    // Save
    const filename = `${preset.id}.yaml`
    const filepath = path.join(this.presetsDir, filename)
    fs.writeFileSync(filepath, yaml.stringify(preset))

    // Add to memory
    this.presets.set(preset.id, preset)
    this.saveMetadata()

    return preset
  }

  /**
   * Toggle favorite status for a preset
   */
  toggleFavorite(id: string): boolean {
    const preset = this.presets.get(id)

    if (!preset) {
      throw new Error(`Preset ${id} not found`)
    }

    const index = this.metadata.favorites.indexOf(id)

    if (index === -1) {
      this.metadata.favorites.push(id)
    } else {
      this.metadata.favorites.splice(index, 1)
    }

    this.saveMetadata()
    return index === -1 // Return true if added to favorites
  }

  /**
   * Get favorite presets
   */
  getFavorites(): ConfigPreset[] {
    return this.metadata.favorites
      .map((id) => this.presets.get(id))
      .filter((preset) => preset !== undefined) as ConfigPreset[]
  }

  /**
   * Get preset statistics
   */
  getStats(): PresetMetadata {
    return {
      ...this.metadata,
      totalPresets: this.presets.size,
      categories: this.getCategoryCount(),
    }
  }

  private generatePresetId(name: string): string {
    let baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    let id = baseId
    let counter = 1

    while (this.presets.has(id)) {
      id = `${baseId}-${counter}`
      counter++
    }

    return id
  }

  /**
   * Duplicate a preset
   */
  duplicatePreset(id: string, newName: string): ConfigPreset {
    const original = this.presets.get(id)

    if (!original) {
      throw new Error(`Preset ${id} not found`)
    }

    return this.createPreset({
      name: newName,
      description: `Copy of ${original.description}`,
      category: original.category,
      tags: [...original.tags],
      config: { ...original.config },
      author: original.author,
    })
  }

  /**
   * Get recommended presets based on project type
   */
  getRecommendedPresets(projectPath: string): ConfigPreset[] {
    const recommendations: ConfigPreset[] = []

    // Check if it's a CI environment
    if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
      const ciPreset = this.getPreset('ci-friendly')
      if (ciPreset) recommendations.push(ciPreset)
    }

    // Check for .git directory
    if (fs.existsSync(path.join(projectPath, '.git'))) {
      const teamPreset = this.getPreset('team-collab')
      if (teamPreset) recommendations.push(teamPreset)
    }

    // Check for package.json (Node.js project)
    if (fs.existsSync(path.join(projectPath, 'package.json'))) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'),
        )

        // If it has test scripts, recommend cautious preset
        if (packageJson.scripts?.test) {
          const cautiousPreset = this.getPreset('cautious')
          if (cautiousPreset) recommendations.push(cautiousPreset)
        }
      } catch (error) {
        // Ignore parse errors
      }
    }

    // Default recommendations if none found
    if (recommendations.length === 0) {
      const minimalPreset = this.getPreset('minimal')
      if (minimalPreset) recommendations.push(minimalPreset)
    }

    return recommendations
  }
}
