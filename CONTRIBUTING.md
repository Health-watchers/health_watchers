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

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** (check with `node --version`)
- **npm** or **yarn** package manager
- **MongoDB** (local installation or MongoDB Atlas account)
- **Git** for version control
- **Docker** (optional, for containerized development)

### Setup Instructions

1. **Fork the repository** on GitHub
   - Navigate to https://github.com/Health-watchers/health_watchers
   - Click the "Fork" button in the top right

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/health_watchers.git
   cd health_watchers
   ```

3. **Add upstream remote** (to sync with main repository):
   ```bash
   git remote add upstream https://github.com/Health-watchers/health_watchers.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration:
   # - MongoDB connection string
   # - Stellar network credentials
   # - JWT secrets
   # - Email service credentials (if testing email features)
   ```

6. **Start MongoDB** (if running locally):
   ```bash
   mongod --dbpath /path/to/data
   ```

7. **Start development servers**:
   ```bash
   npm run dev
   ```
   This will start:
   - API server on http://localhost:3001
   - Web frontend on http://localhost:3000
   - Stellar service on http://localhost:3002

8. **Verify setup**:
   - Open http://localhost:3000 in your browser
   - Check that the API is responding at http://localhost:3001/health

## Development Workflow

### Branch Naming Convention

Create descriptive branch names that reference the issue number:

- `feature/issue-number-description` - New features (e.g., `feature/123-stellar-payments`)
- `fix/issue-number-description` - Bug fixes (e.g., `fix/456-login-error`)
- `docs/issue-number-description` - Documentation (e.g., `docs/789-api-guide`)
- `refactor/issue-number-description` - Code refactoring
- `test/issue-number-description` - Test additions
- `chore/issue-number-description` - Maintenance tasks

### Workflow Steps

1. **Sync with upstream** before starting work:
   ```bash
   git checkout main
   git fetch upstream
   git merge upstream/main
   git push origin main
   ```

2. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/123-your-feature-name
   ```

3. **Make your changes** following our coding standards

4. **Write tests** for your changes (required for all new features)

5. **Run the test suite** and ensure everything passes:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

6. **Commit your changes** using conventional commits:
   ```bash
   git commit -m "feat: add user management endpoints

   Closes #123"
   ```

7. **Push to your fork**:
   ```bash
   git push origin feature/123-your-feature-name
   ```

8. **Open a Pull Request** on GitHub:
   - Link to the GitHub issue
   - Fill out the PR template completely
   - Request review from at least one maintainer
   - Ensure all CI checks pass

9. **Address review feedback** and push updates

10. **Squash commits** before merge (if requested by maintainer)

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

### Before Submitting

1. **Link to the GitHub issue** in your PR description
2. **Fill out the PR template** completely
3. **Update documentation** if you're changing functionality
4. **Add tests** for new features or bug fixes
5. **Update the CHANGELOG** if applicable
6. **Ensure all CI checks pass**
7. **Self-review your code** before requesting review

### PR Requirements

- Tests passing ✅
- Lint passing (zero warnings) ✅
- TypeScript type check passing ✅
- Description filled out ✅
- At least 1 approving review from maintainer ✅

### Review Process

1. **Request review** from at least one maintainer
2. **Address review feedback** promptly
3. **Push updates** to the same branch
4. **Resolve conversations** when feedback is addressed
5. **Squash commits** if requested before merging

### Merging

- Maintainers will merge your PR once approved
- PRs are typically squashed into a single commit
- Your contribution will be credited in the commit and CHANGELOG

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

### TypeScript Requirements

- Use **TypeScript** for all new code
- Enable **strict mode** in tsconfig.json (already configured)
- **No `any` types** - use proper typing or `unknown` with type guards
- **All functions must have return type annotations**
- Use **interfaces** for object shapes
- Use **enums** or **union types** for fixed sets of values

Example:
```typescript
// ❌ Bad
function getUser(id) {
  return db.users.findOne({ id });
}

// ✅ Good
interface User {
  id: string;
  email: string;
  fullName: string;
}

async function getUser(id: string): Promise<User | null> {
  return db.users.findOne({ id });
}
```

### Code Quality Rules

- **No `console.log`** - use the logger service instead:
  ```typescript
  import { logger } from './lib/logger';
  logger.info('User created', { userId: user.id });
  ```
- **No unused variables** - ESLint will catch these
- **No commented-out code** - remove it or explain why it's there
- **Prefer `const`** over `let` when variables don't change
- **Use async/await** instead of raw promises

### Code Style

- **2 spaces** for indentation
- **Single quotes** for strings
- **Semicolons** required
- **Trailing commas** in multi-line objects/arrays
- **Max line length**: 120 characters
- **ESLint and Prettier** are enforced in CI

Run formatting before committing:
```bash
npm run format
npm run lint:fix
```

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

### Testing Requirements

All new code must include tests:

- **Unit tests** for all new service functions
- **Integration tests** for all new API endpoints
- **Minimum 80% coverage** for new code
- **All tests must pass** before PR can be merged

### Unit Tests

Write tests for business logic and service functions:

```typescript
// users.service.test.ts
import { UserService } from './users.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  it('should create a new user', async () => {
    const userData = {
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass123!'
    };
    
    const user = await userService.create(userData);
    
    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.password).not.toBe(userData.password); // Should be hashed
  });

  it('should throw error for duplicate email', async () => {
    const userData = { fullName: 'Test', email: 'test@example.com', password: 'pass' };
    await userService.create(userData);
    
    await expect(userService.create(userData)).rejects.toThrow('Email already exists');
  });
});
```

### Integration Tests

Test API endpoints end-to-end:

```typescript
// users.controller.test.ts
import request from 'supertest';
import { app } from '../../app';

describe('POST /api/v1/users', () => {
  it('should create a user and return 201', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .send({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'SecurePass123!'
      })
      .expect(201);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe('test@example.com');
    expect(response.body.data.password).toBeUndefined(); // Should not return password
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .send({
        fullName: 'Test User',
        email: 'invalid-email',
        password: 'SecurePass123!'
      })
      .expect(400);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('email');
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- users.test.ts

# Run tests for specific app
npm test -- --projects apps/api
```

### Test Coverage

- View coverage report after running `npm run test:coverage`
- Coverage reports are uploaded to Codecov in CI
- Aim for 80%+ coverage on new code
- Focus on testing critical paths and edge cases

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

## Architecture Decisions

### Adding New Modules

When adding a new feature module to the API:

1. Create a new folder in `apps/api/src/modules/[module-name]/`
2. Follow this structure:
   ```
   modules/
     your-module/
       your-module.model.ts      # Mongoose schema
       your-module.controller.ts # Express route handlers
       your-module.service.ts    # Business logic
       your-module.validation.ts # Zod validation schemas
       your-module.test.ts       # Tests
       index.ts                  # Exports
   ```
3. Register routes in `apps/api/src/app.ts`
4. Add appropriate middleware (auth, validation, rate limiting)

### Adding New Stellar Operations

To add new Stellar blockchain operations:

1. Add the operation to `apps/stellar-service/src/operations/`
2. Create a service function that builds the transaction
3. Add validation for operation parameters
4. Create an API endpoint in `apps/api/src/modules/payments/`
5. Add tests for both the Stellar operation and API endpoint
6. Document the operation in the API docs

Example:
```typescript
// stellar-service/src/operations/claimable-balance.ts
export async function createClaimableBalance(params: ClaimableBalanceParams) {
  const transaction = new TransactionBuilder(sourceAccount, { fee, networkPassphrase })
    .addOperation(Operation.createClaimableBalance({ ... }))
    .setTimeout(30)
    .build();
  
  return transaction;
}
```

### Adding New AI Endpoints

To add new AI-powered features:

1. Add the endpoint to `apps/api/src/modules/ai/`
2. Use the OpenAI client from `apps/api/src/lib/openai.ts`
3. Implement rate limiting (AI endpoints are expensive)
4. Add input validation and sanitization
5. Log AI requests for monitoring and debugging
6. Add error handling for API failures

Example:
```typescript
// ai/ai.controller.ts
export async function generateDiagnosis(req: Request, res: Response) {
  const { symptoms, patientHistory } = req.body;
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a medical assistant...' },
      { role: 'user', content: `Symptoms: ${symptoms}` }
    ]
  });
  
  return res.json({ diagnosis: completion.choices[0].message.content });
}
```

### Database Schema Changes

When modifying database schemas:

1. Update the Mongoose model in `*.model.ts`
2. Create a migration in `apps/api/src/migrations/`
3. Test the migration on a local database
4. Document breaking changes in CHANGELOG
5. Update API documentation if fields change

### Adding Dependencies

Before adding a new npm package:

1. Check if similar functionality exists in current dependencies
2. Verify the package is actively maintained
3. Check for security vulnerabilities
4. Consider bundle size impact (especially for frontend)
5. Add to appropriate workspace (`apps/api`, `apps/web`, etc.)

```bash
# Add to specific workspace
npm install package-name --workspace=apps/api
```

## Questions?

If you have questions, please:
- Check existing issues and discussions
- Open a new issue with the `question` label
- Reach out to maintainers

Thank you for contributing to Health Watchers! 🎉
