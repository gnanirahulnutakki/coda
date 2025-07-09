# Setting Up Your New Claude Code Enhancement Tool

This guide will help you rebrand and deploy this project under your own name.

## 🚀 Quick Setup Steps

### 1. Clone and Setup

```bash
# Clone this repository
git clone <this-repo-url> your-project-name
cd your-project-name

# Remove existing git history
rm -rf .git
git init

# Install dependencies
npm install
```

### 2. Update Branding

Replace the following placeholders in these files:

#### `package.json`

- `YOUR-PACKAGE-NAME` → Your npm package name (e.g., `claude-enhancer`)
- `YOUR-CLI-NAME` → Your CLI command name (e.g., `claude-enhance`)
- `YOUR NAME` → Your full name
- `your.email@example.com` → Your email
- `YOUR-USERNAME` → Your GitHub username
- `YOUR-REPO-NAME` → Your GitHub repository name

#### `README.md`

- Update all references to `claude-composer` with your new name
- Update badge URLs to point to your repository
- Update the issue tracker URL

#### `src/cli/parser.ts`

- Line 7: Update `.name('claude-composer')` to your CLI name

#### Throughout the codebase

Search and replace:

- `claude-composer` → your-cli-name
- `~/.claude-composer/` → `~/.your-cli-name/`

### 3. Update Configuration Paths

Edit `src/config/paths.ts` to use your new directory name:

```typescript
const CONFIG_DIR_NAME = '.your-cli-name'
```

### 4. Build and Test

```bash
# Build the project
npm run build

# Run tests
npm test

# Test locally
npm link
your-cli-name --help
```

### 5. Publish to npm

```bash
# Login to npm
npm login

# Publish
npm publish
```

### 6. Create GitHub Repository

1. Create a new repository on GitHub
2. Push your code:

```bash
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

## 📋 Checklist

- [ ] Updated package.json with your information
- [ ] Replaced all occurrences of `claude-composer`
- [ ] Updated configuration directory name
- [ ] Ran tests successfully
- [ ] Created GitHub repository
- [ ] Published to npm (optional)

## 🎯 Additional Customizations

### Adding New Features

1. **New Pattern Matchers**: Add to `src/patterns/registry.ts`
2. **New CLI Options**: Update `src/cli/parser.ts`
3. **New Safety Checks**: Add to `src/safety/checker.ts`
4. **New Toolsets**: Create in `src/internal-toolsets/`

### Changing Default Behavior

1. **Default Config**: Edit `getDefaultAppConfig()` in `src/config/manager.ts`
2. **Pattern Behavior**: Modify patterns in `src/patterns/registry.ts`
3. **Safety Defaults**: Update in `src/core/preflight.ts`

## 🔧 Development Tips

- Use `npm run build:watch` for development
- Enable debug mode with `--debug` flag
- Check logs in `~/.your-cli-name/logs/`
- Run `npm run format` before committing

## 📄 License Considerations

This project is in the public domain (Unlicense). You can:

- Use it for any purpose
- Modify it freely
- Distribute it under any license
- Keep your modifications private

No attribution required, but appreciated!

---

Good luck with your Claude Code enhancement tool! 🎉
