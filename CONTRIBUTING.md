# Contributing to Health Watchers

Thank you for your interest in contributing to Health Watchers! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Protection Rules](#branch-protection-rules)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/health_watchers.git
   cd health_watchers
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```
5. **Start development servers**:
   ```bash
   npm run dev
   ```

## Development Workflow

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
   
   Branch naming conventions:
   - `feat/` - New features
   - `fix/` - Bug fixes
   - `docs/` - Documentation changes
   - `refactor/` - Code refactoring
   - `test/` - Test additions or modifications
   - `chore/` - Maintenance tasks

2. **Make your changes** following our coding standards

3. **Write tests** for your changes

4. **Run the test suite**:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

5. **Commit your changes** using conventional commits:
   ```bash
   git commit -m "feat: add user management endpoints"
   ```

6. **Push to your fork**:
   ```bash
   git push origin feat/your-feature-name
   ```

7. **Open a Pull Request** on GitHub

## Branch Protection Rules

The `main` branch is protected with the following rules:

### Required Status Checks

All of the following CI checks must pass before merging:

- ✅ **Quality Checks** (TypeScript, ESLint, Prettier)
  - TypeScript type checking (`tsc --noEmit`)
  - ESLint with zero-warning policy
  - Prettier format check

- ✅ **Security Scan**
  - npm audit (fails on high/critical vulnerabilities)
  - Dependency license check (no GPL in production)
  - Snyk security scan

- ✅ **Test Suite**
  - Unit tests with MongoDB Memory Server
  - Integration tests
  - Coverage report uploaded to Codecov

- ✅ **Build**
  - All applications build successfully
  - Build artifacts cached with Turbo

- ✅ **Docker Build**
  - Docker images build successfully
  - Docker Compose test passes

### Code Review Requirements

- **At least 1 approving review** required from a maintainer
- **No direct pushes to main** - all changes must go through pull requests
- **Dismiss stale reviews** when new commits are pushed
- **Require review from code owners** for specific paths

### Additional Requirements

- **Branches must be up to date** before merging
- **Linear history** preferred (rebase instead of merge commits)
- **Signed commits** recommended for security

### Setting Up Branch Protection (For Maintainers)

1. Go to **Settings** → **Branches** → **Branch protection rules**
2. Add rule for `main` branch
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require approvals (1)
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings

4. Add required status checks:
   - `Quality Checks (typecheck, 18)`
   - `Quality Checks (lint, 18)`
   - `Quality Checks (format, 18)`
   - `Security Scan`
   - `Test Suite (18)`
   - `Build Applications (api, 18)`
   - `Build Applications (web, 18)`
   - `Build Applications (stellar-service, 18)`

## Pull Request Process

1. **Update documentation** if you're changing functionality
2. **Add tests** for new features or bug fixes
3. **Update the CHANGELOG** if applicable
4. **Ensure all CI checks pass**
5. **Request review** from at least one maintainer
6. **Address review feedback** promptly
7. **Squash commits** if requested before merging

### Pull Request Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Dependent changes merged

## Related Issues
Closes #(issue number)
```

## Coding Standards

### TypeScript

- Use **TypeScript** for all new code
- Enable **strict mode** in tsconfig.json
- Avoid `any` types - use proper typing
- Use **interfaces** for object shapes
- Use **enums** for fixed sets of values

### Code Style

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** required
- **Trailing commas** in multi-line objects/arrays
- **Max line length**: 120 characters

### Naming Conventions

- **camelCase** for variables and functions
- **PascalCase** for classes and types
- **UPPER_SNAKE_CASE** for constants
- **kebab-case** for file names

### File Organization

```
apps/
  api/
    src/
      modules/
        users/
          users.controller.ts
          users.service.ts
          users.model.ts
          users.validation.ts
          users.test.ts
```

## Testing

### Unit Tests

- Write tests for all new features
- Aim for **80%+ code coverage**
- Use **Jest** for testing
- Mock external dependencies

```typescript
describe('UserService', () => {
  it('should create a new user', async () => {
    const user = await userService.create({ ... });
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
});
```

### Integration Tests

- Test API endpoints end-to-end
- Use **supertest** for HTTP testing
- Use **MongoDB Memory Server** for database

```typescript
describe('POST /api/v1/users', () => {
  it('should create a user', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .send({ fullName: 'Test User', email: 'test@example.com' })
      .expect(201);
    
    expect(response.body.data.email).toBe('test@example.com');
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- users.test.ts
```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions or modifications
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```bash
feat(auth): add two-factor authentication

Implement TOTP-based 2FA for user accounts.
Users can enable 2FA in their profile settings.

Closes #123

fix(payments): prevent double-confirmation of transactions

Add idempotency check to prevent the same transaction
from being confirmed multiple times.

Closes #456

docs(readme): update installation instructions

Add Docker setup instructions and troubleshooting section.
```

## Security

- **Never commit secrets** or credentials
- Use **environment variables** for configuration
- Follow **OWASP** security best practices
- Report security vulnerabilities privately to maintainers

## Questions?

If you have questions, please:
- Check existing issues and discussions
- Open a new issue with the `question` label
- Reach out to maintainers

Thank you for contributing to Health Watchers! 🎉
