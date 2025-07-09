import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

export function isFileInProjectRoot(filePath: string): boolean {
  try {
    const projectRoot = fs.realpathSync(process.cwd())
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath)
    
    // For non-existent files, we need to resolve the directory path
    let resolvedPath: string
    if (fs.existsSync(absolutePath)) {
      // Check if it's a symlink
      const stats = fs.lstatSync(absolutePath)
      if (stats.isSymbolicLink()) {
        // For symlinks, we check the symlink location, not the target
        // But we need to resolve the parent directory to handle /var vs /private/var
        const parentDir = path.dirname(absolutePath)
        const basename = path.basename(absolutePath)
        const resolvedParent = fs.realpathSync(parentDir)
        resolvedPath = path.join(resolvedParent, basename)
      } else {
        resolvedPath = fs.realpathSync(absolutePath)
      }
    } else {
      // For non-existent files, resolve the parent directory and append the filename
      const dir = path.dirname(absolutePath)
      const basename = path.basename(absolutePath)
      
      // Find the nearest existing parent directory
      let currentDir = dir
      while (!fs.existsSync(currentDir) && currentDir !== path.dirname(currentDir)) {
        currentDir = path.dirname(currentDir)
      }
      
      if (fs.existsSync(currentDir)) {
        const resolvedDir = fs.realpathSync(currentDir)
        const remainingPath = path.relative(currentDir, dir)
        resolvedPath = remainingPath 
          ? path.join(resolvedDir, remainingPath, basename)
          : path.join(resolvedDir, basename)
      } else {
        // If no parent exists, use the absolute path as-is
        resolvedPath = absolutePath
      }
    }
    
    const relative = path.relative(projectRoot, resolvedPath)
    // If relative path starts with .. or is absolute, it's outside project root
    // Empty relative path means it's the project root itself
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  } catch (error) {
    // If we can't resolve the path, fall back to simple check
    const projectRoot = process.cwd()
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(projectRoot, filePath)
    const relative = path.relative(projectRoot, absolutePath)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }
}

export function expandPath(p: string): string {
  // Handle tilde expansion for home directory
  if (p.startsWith('~/')) {
    p = path.join(os.homedir(), p.slice(2))
  } else if (p === '~') {
    p = os.homedir()
  } else if (p.startsWith('~')) {
    // Handle cases like ~username (though not typically supported in Node.js)
    p = path.join(os.homedir(), p.slice(1))
  }

  // Expand environment variables
  p = p.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (match, envVar) => {
    return process.env[envVar] || match
  })

  // Resolve to absolute path
  return path.resolve(p)
}
