# Contributing Guide

Thank you for your interest in contributing to Health Watchers! This guide will help you get started with development, understand our workflow, and adhere to our code standards.

## Table of Contents

- [Developer Setup](#developer-setup)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Commit Guidelines](#commit-guidelines)

## Developer Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 10.9.2
- Docker and Docker Compose
- Git
- MongoDB (local or via Docker)

### Initial Setup

1. **Fork and Clone**
```bash
git clone https://github.com/YOUR_USERNAME/health-watchers.git
cd health-watchers
git remote add upstream https://github.com/Health-watchers/health_watchers.git
```

2. **Install Dependencies**
```bash
npm install
```

3. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your local settings
```

4. **Start MongoDB** (using Docker)
```bash
docker-compose -f docker-compose.dev.yml up -d
```

5. **Run Migrations**
```bash
npm run migrate:up --workspace=api
```

6. **Start Development Servers**
```bash
npm run dev
```

This starts:
- Web app on `http://localhost:3000`
- API server on `http://localhost:3001`
- Stellar service on `http://localhost:3002`

## Development Workflow

### Creating a Feature Branch

1. **Sync with Upstream**
```bash
git fetch upstream
git checkout -b feature/your-feature upstream/main
```

2. **Make Your Changes**
- Write code
- Run tests frequently
- Follow code standards (see below)

3. **Test Locally**
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

4. **Lint and Format**
```bash
# Run linters
npm run lint

# Auto-fix formatting
npm run format
```

### Before Pushing

1. **Update from Main**
```bash
git fetch upstream
git rebase upstream/main
```

2. **Squash Commits (if needed)**
```bash
git rebase -i upstream/main
```

3. **Verify Tests Pass**
```bash
npm test
npm run lint
```

4. **Push to Your Fork**
```bash
git push origin feature/your-feature
```

## Code Standards

### TypeScript

- Use strict mode (enabled by default)
- Define types explicitly; avoid `any`
- Use interfaces for object shapes
- Add JSDoc comments for public functions

**Example:**
```typescript
/**
 * Retrieves a patient by ID with optional decryption
 * @param id - Patient ID
 * @param decrypt - Whether to decrypt PHI
 * @returns Patient record
 * @throws {NotFoundException} If patient not found
 */
async getPatient(id: string, decrypt: boolean = false): Promise<Patient> {
  const patient = await db.collection('patients').findOne({ _id: id });
  if (!patient) {
    throw new NotFoundException('Patient not found');
  }
  return decrypt ? decryptPHI(patient) : patient;
}
```

### Component Standards (React/Next.js)

- Use functional components
- Prefer hooks over class components
- Memoize components that receive props
- Add prop type validation

**Example:**
```typescript
interface PatientCardProps {
  patient: Patient;
  onEdit?: (patient: Patient) => void;
}

export const PatientCard: React.FC<PatientCardProps> = React.memo(({ patient, onEdit }) => {
  return (
    <div className="card">
      <h2>{patient.firstName} {patient.lastName}</h2>
      {onEdit && <button onClick={() => onEdit(patient)}>Edit</button>}
    </div>
  );
});
```

### API Endpoints

- Use RESTful conventions (GET, POST, PUT, DELETE)
- Return consistent response format
- Include proper error handling
- Add rate limiting where needed
- Document with Swagger/OpenAPI

**Example:**
```typescript
/**
 * @swagger
 * /patients/{id}:
 *   get:
 *     summary: Get patient by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *     responses:
 *       200: { description: Patient found }
 *       404: { description: Patient not found }
 */
router.get('/patients/:id', requireAuth, async (req, res, next) => {
  try {
    const patient = await patientService.getPatient(req.params.id);
    res.json({ data: patient });
  } catch (error) {
    next(error);
  }
});
```

### File Organization

```
apps/api/src/
├── modules/
│   ├── patients/
│   │   ├── patients.controller.ts
│   │   ├── patients.service.ts
│   │   ├── patients.model.ts
│   │   ├── patients.validation.ts
│   │   └── __tests__/
│   │       └── patients.test.ts
```

### Naming Conventions

- **Files:** kebab-case (e.g., `patient-service.ts`)
- **Classes:** PascalCase (e.g., `PatientService`)
- **Functions:** camelCase (e.g., `getPatient`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `DEFAULT_LIMIT`)
- **Interfaces:** PascalCase with prefix (e.g., `IPatient`)

### Error Handling

Always include proper error handling:

```typescript
try {
  // operation
} catch (error) {
  logger.error('Operation failed', { error, context });
  next(new AppError('Operation failed', 500));
}
```

## Testing Requirements

### Test Coverage Thresholds

- Statements: >= 80%
- Branches: >= 75%
- Functions: >= 80%
- Lines: >= 80%

### Writing Tests

Use Jest for unit and integration tests:

```typescript
describe('PatientService', () => {
  let service: PatientService;

  beforeEach(() => {
    service = new PatientService(mockDb);
  });

  it('should retrieve patient by ID', async () => {
    const patient = await service.getPatient('123');
    expect(patient).toBeDefined();
    expect(patient.id).toBe('123');
  });

  it('should throw when patient not found', async () => {
    await expect(service.getPatient('invalid')).rejects.toThrow(NotFoundException);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific file
npm test -- patients.test.ts

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Testing Checklist

- [ ] Unit tests for business logic
- [ ] Integration tests for API endpoints
- [ ] Error cases covered
- [ ] Edge cases considered
- [ ] Coverage thresholds met

## Pull Request Process

### Creating a PR

1. **Push Your Branch**
```bash
git push origin feature/your-feature
```

2. **Create PR on GitHub**
- Title: Keep under 70 characters, be descriptive
- Description: Fill out the PR template completely

3. **PR Title Format**
```
[type]: Brief description

Types: feat, fix, docs, refactor, test, chore
```

### PR Template

```markdown
## Description
Brief explanation of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Related Issues
Closes #897

## Changes Made
- Item 1
- Item 2
- Item 3

## Testing
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing completed

## Screenshots (if applicable)
Paste images here

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] No console errors/warnings
- [ ] Docs updated
- [ ] No breaking changes
```

### PR Review Requirements

- [ ] Passes CI/CD pipeline
- [ ] Code review approval (minimum 2)
- [ ] Tests pass with coverage >= 80%
- [ ] No conflicts with main branch
- [ ] Commits follow guidelines

### Merging

Once approved, use "Squash and merge":
```bash
git checkout main
git pull upstream main
git log origin/main..my-feature  # Verify commits
```

## Commit Guidelines

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `refactor` - Code refactoring
- `test` - Test additions/modifications
- `chore` - Build, deps, config changes
- `perf` - Performance improvements

### Scope

Module or area affected:
```
feat(patients): add duplicate detection
fix(payments): resolve stellar transaction timeout
docs(api): update authentication examples
```

### Subject

- Imperative mood ("add" not "added")
- No period at end
- Lowercase
- Keep under 50 characters

### Body

Explain what and why (not how):
```
Add patient duplicate detection using fuzzy matching.

This prevents creating duplicate patient records by:
- Matching on first/last name + DOB
- Calculating similarity score >= 0.85
- Prompting user before creation
```

### Footer

Reference issues:
```
Closes #897
Related-to: #896
```

### Example Commit

```
feat(patients): add duplicate detection

Implement fuzzy matching algorithm to identify
potential duplicate patient records before creation.

- Use metaphone for phonetic matching
- Calculate Jaro-Winkler similarity score
- Show merge suggestions to user

Closes #897
```

## Useful Commands

```bash
# Development
npm run dev              # Start all services
npm run dev:web         # Web app only
npm run dev:api         # API only

# Testing
npm test               # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report

# Code Quality
npm run lint          # Run linters
npm run format        # Auto-format code
npm run type-check   # TypeScript check

# Database
npm run migrate:up         # Run pending migrations
npm run migrate:down       # Rollback last migration
npm run migrate:status     # Show migration status
npm run seed              # Seed database

# Build
npm run build         # Build for production
npm run start         # Start production server
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
```

### MongoDB Connection Failed
```bash
# Check MongoDB is running
docker-compose -f docker-compose.dev.yml ps
# Restart if needed
docker-compose -f docker-compose.dev.yml restart
```

### Tests Failing Locally
```bash
# Clear cache
npm run test -- --clearCache
# Run with verbose output
npm run test -- --verbose
```

## Getting Help

- **Issues:** Check existing issues first
- **Discussions:** Start a discussion for ideas
- **PR Feedback:** Ask in the PR comments
- **Email:** dev@healthwatchers.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
