# Contributing to Coda

Thank you for your interest in contributing to Coda! We're excited to have you join our community of developers working to make AI coding safer and more accessible.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Accept feedback gracefully
- Put the community first

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Basic TypeScript knowledge
- Familiarity with AI coding assistants (helpful but not required)

### Development Setup

1. **Fork the repository**

   ```bash
   # Click "Fork" on GitHub, then:
   git clone https://github.com/gnanirahulnutakki/coda.git
   cd coda
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run tests**

   ```bash
   npm test
   ```

4. **Start development**
   ```bash
   npm run dev
   ```

## 📝 How to Contribute

### Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates.

**Bug reports should include:**

- Clear, descriptive title
- Steps to reproduce
- Expected behavior
- Actual behavior
- System information (OS, Node version, AI provider)
- Relevant logs or error messages

Use our bug report template when creating an issue.

### Suggesting Features

We love feature suggestions! Please:

- Check if the feature has already been suggested
- Clearly describe the problem it solves
- Provide use cases and examples
- Consider how it fits with Coda's philosophy of safety and simplicity

### Pull Requests

1. **Find an issue to work on**
   - Look for issues labeled `good first issue` or `help wanted`
   - Comment on the issue to claim it
   - Wait for maintainer approval before starting

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-number-description
   ```

3. **Make your changes**
   - Write clean, readable code
   - Follow our coding standards (see below)
   - Add tests for new functionality
   - Update documentation as needed

4. **Test thoroughly**

   ```bash
   # Run all tests
   npm test

   # Run specific test file
   npm test -- checkpoint.test.ts

   # Run with coverage
   npm run test:coverage
   ```

5. **Commit your changes**

   ```bash
   # We follow conventional commits
   git commit -m "feat: add memory eviction policy"
   git commit -m "fix: resolve checkpoint rollback issue"
   git commit -m "docs: update provider comparison table"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

## 💻 Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Provide explicit types (avoid `any`)
- Use interfaces over type aliases for objects
- Document complex types

```typescript
// Good
interface ProviderConfig {
  id: string
  name: string
  features: string[]
}

// Avoid
type ProviderConfig = {
  id: any
  name: any
  features: any[]
}
```

### File Organization

```
src/
├── cli/          # CLI command handlers
├── config/       # Configuration management
├── features/     # Core features (memory, checkpoint, etc.)
├── providers/    # AI provider adapters
├── utils/        # Shared utilities
└── types/        # TypeScript type definitions
```

### Testing Requirements

- All new features must have tests
- Maintain test coverage above 80%
- Write both unit and integration tests
- Use descriptive test names

```typescript
// Good test name
test('checkpoint rollback restores files to previous state', () => {
  // ...
})

// Poor test name
test('rollback works', () => {
  // ...
})
```

### Error Handling

- Always handle errors gracefully
- Provide helpful error messages
- Use custom error classes when appropriate

```typescript
// Good
if (!provider) {
  throw new ProviderNotFoundError(
    `Provider '${id}' not found. Run 'coda doctor' to see available providers.`,
  )
}

// Avoid
if (!provider) {
  throw new Error('error')
}
```

## 🏗️ Architecture Decisions

### Key Principles

1. **Safety First**: Every feature should make AI coding safer
2. **User-Friendly**: APIs should be intuitive and well-documented
3. **Provider-Agnostic**: Core features should work with any AI provider
4. **Extensible**: Easy to add new providers and features
5. **Testable**: Code should be modular and easily testable

### Adding a New AI Provider

1. Create provider definition in `src/config/ai-providers.ts`
2. Implement adapter if needed in `src/providers/`
3. Add tests in `test/providers/`
4. Update documentation

Example:

```typescript
export const AI_PROVIDERS: Record<string, AIProvider> = {
  'new-provider': {
    id: 'new-provider',
    name: 'New AI Assistant',
    description: 'Description of the assistant',
    category: 'native-cli',
    priority: 'medium',
    detectCommand: () => findCommandInPath('new-ai'),
    installInstructions: 'npm install -g new-ai',
    features: ['chat', 'code-generation'],
  },
}
```

### Adding a New Feature

1. Create feature module in `src/features/`
2. Add CLI command in `src/cli/`
3. Write comprehensive tests
4. Update README and documentation
5. Add to wizard if appropriate

## 📚 Documentation

### Code Documentation

- Use JSDoc comments for public APIs
- Include examples in comments
- Document complex algorithms

```typescript
/**
 * Creates a checkpoint of the current project state
 * @param name - Descriptive name for the checkpoint
 * @param options - Optional configuration
 * @returns Checkpoint ID for rollback
 * @example
 * const id = await createCheckpoint('before-refactor', {
 *   includeNodeModules: false
 * })
 */
export async function createCheckpoint(name: string, options?: CheckpointOptions): Promise<string> {
  // Implementation
}
```

### User Documentation

When adding features, update:

- README.md (basic usage)
- docs/CODA_COMPLETE_USER_GUIDE.md (detailed guide)
- Relevant feature-specific docs
- CLI help text

## 🚦 Review Process

### What We Look For

1. **Code Quality**
   - Clean, readable code
   - Proper error handling
   - No unnecessary complexity

2. **Testing**
   - Comprehensive test coverage
   - Tests pass locally and in CI

3. **Documentation**
   - Code is well-commented
   - User docs are updated
   - Commit messages are clear

4. **Performance**
   - No significant performance regressions
   - Memory-efficient implementations

### Review Timeline

- Initial review: Within 2-3 days
- Follow-up reviews: Within 1-2 days
- Small fixes: Same day when possible

## 🎯 Areas We Need Help

### High Priority

- Windows compatibility testing
- Performance optimizations
- Additional AI provider integrations
- Internationalization (i18n)

### Good First Issues

- Improve error messages
- Add more examples to documentation
- Write missing tests
- Fix typos and clarify docs

### Feature Requests

Check our [feature request board](https://github.com/gnanirahulnutakki/coda/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement) for community-requested features.

## 🛠️ Development Commands

```bash
# Development
npm run dev          # Run in development mode
npm run build        # Build for production
npm run lint         # Run linter
npm run format       # Format code

# Testing
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report

# Release
npm run release:patch # Bump patch version
npm run release:minor # Bump minor version
npm run release:major # Bump major version
```

## 📦 Release Process

1. Ensure all tests pass
2. Update CHANGELOG.md
3. Run `npm run release:TYPE`
4. Push tags: `git push --follow-tags`
5. GitHub Actions will handle npm publish

## 🙏 Recognition

We appreciate all contributions! Contributors will be:

- Added to our Contributors list
- Mentioned in release notes
- Given credit in relevant documentation

## 💬 Questions?

- Open a [Discussion](https://github.com/gnanirahulnutakki/coda/discussions)
- Join our community chat (coming soon)
- Tag maintainers in issues: @gnanirahulnutakki

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make AI coding safer and more accessible! 🎉
