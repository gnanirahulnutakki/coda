import * as os from 'os'
import * as path from 'path'

/**
 * Get platform-specific paths for AI providers
 */
export function getPlatformPaths(provider: string): string[] {
  const platform = process.platform
  const homeDir = os.homedir()
  
  const paths: string[] = []
  
  switch (platform) {
    case 'win32':
      // Windows paths
      paths.push(
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', provider, `${provider}.exe`),
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', provider, 'bin', `${provider}.exe`),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', provider, `${provider}.exe`),
        path.join(homeDir, 'AppData', 'Local', provider, `${provider}.exe`),
        path.join(homeDir, 'AppData', 'Local', provider, 'bin', `${provider}.exe`),
        path.join(homeDir, `.${provider}`, 'bin', `${provider}.exe`),
        path.join('C:\\tools', provider, `${provider}.exe`), // Chocolatey default
        path.join(process.env.LOCALAPPDATA || '', provider, `${provider}.exe`)
      )
      
      // Add to PATH locations
      if (process.env.PATH) {
        const pathDirs = process.env.PATH.split(path.delimiter)
        pathDirs.forEach(dir => {
          paths.push(path.join(dir, `${provider}.exe`))
        })
      }
      break
      
    case 'darwin':
      // macOS paths
      paths.push(
        `/usr/local/bin/${provider}`,
        `/opt/homebrew/bin/${provider}`, // Apple Silicon
        path.join(homeDir, `.${provider}`, 'bin', provider),
        path.join(homeDir, '.local', 'bin', provider),
        `/Applications/${provider}.app/Contents/MacOS/${provider}`,
        `/Applications/${provider}.app/Contents/Resources/${provider}`
      )
      break
      
    case 'linux':
      // Linux paths
      paths.push(
        `/usr/local/bin/${provider}`,
        `/usr/bin/${provider}`,
        `/opt/${provider}/bin/${provider}`,
        path.join(homeDir, `.${provider}`, 'bin', provider),
        path.join(homeDir, '.local', 'bin', provider),
        path.join(homeDir, 'bin', provider),
        `/snap/bin/${provider}`, // Snap packages
        `/var/lib/flatpak/exports/bin/${provider}` // Flatpak
      )
      break
  }
  
  // Add Python/pip paths for tools like Aider
  if (provider === 'aider') {
    const pythonPaths = getPythonPaths()
    pythonPaths.forEach(pyPath => {
      paths.push(path.join(pyPath, provider + (platform === 'win32' ? '.exe' : '')))
    })
  }
  
  return paths
}

/**
 * Get Python script paths (for pip-installed tools)
 */
function getPythonPaths(): string[] {
  const platform = process.platform
  const homeDir = os.homedir()
  const paths: string[] = []
  
  if (platform === 'win32') {
    // Windows Python paths
    paths.push(
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'Python', 'Python*', 'Scripts'),
      path.join(homeDir, 'AppData', 'Roaming', 'Python', 'Python*', 'Scripts'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Python*', 'Scripts'),
      'C:\\Python*\\Scripts'
    )
  } else {
    // Unix-like Python paths
    paths.push(
      path.join(homeDir, '.local', 'bin'),
      path.join(homeDir, '.pyenv', 'shims'),
      '/usr/local/bin',
      path.join(homeDir, 'anaconda3', 'bin'),
      path.join(homeDir, 'miniconda3', 'bin')
    )
  }
  
  return paths
}

/**
 * Get the command extension for the current platform
 */
export function getCommandExtension(): string {
  return process.platform === 'win32' ? '.exe' : ''
}

/**
 * Get shell command for the current platform
 */
export function getShellCommand(): string {
  return process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
}

/**
 * Quote a path for shell execution
 */
export function quotePath(p: string): string {
  if (process.platform === 'win32') {
    // Windows: use double quotes
    return `"${p}"`
  } else {
    // Unix: escape spaces and special characters
    return p.replace(/(["\s'$`\\])/g, '\\$1')
  }
}

/**
 * Get environment path separator
 */
export function getPathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':'
}

/**
 * Check if running with admin/sudo privileges
 */
export function isElevated(): boolean {
  if (process.platform === 'win32') {
    // Windows: check if running as Administrator
    try {
      require('child_process').execSync('net session', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  } else {
    // Unix: check if running as root
    return process.getuid?.() === 0
  }
}