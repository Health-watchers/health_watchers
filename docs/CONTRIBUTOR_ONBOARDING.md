# Contributor Onboarding Guide

Get to a working local environment with real data in **15 minutes**.

**Target audience**: First-time contributors  
**Time estimate**: 15 minutes  
**Last updated**: 2026-10-17

---

## Prerequisites

Ensure you have these installed:
```bash
node --version      # v22.x or higher
npm --version       # v10.x or higher
git --version       # Any recent version
docker --version    # For local MongoDB/Redis
docker-compose --version
```

**If not installed**, visit:
- Node.js: https://nodejs.org (install v22 LTS)
- Docker: https://docker.com/products/docker-desktop

---

## Step 1: Clone & Setup (2 minutes)

```bash
# Clone the repository
git clone https://github.com/Health-Watchers/health_watchers.git
cd health_watchers

# Install dependencies (root + all workspaces)
npm install

# This installs packages in:
# - root (shared dependencies)
# - apps/api
# - apps/web
# - apps/stellar-service
# - packages/*
```

---

## Step 2: Start Local Database & Cache (2 minutes)

In a **new terminal window**:

```bash
# Start MongoDB and Redis via Docker Compose
docker-compose up -d

# Verify they're running
docker ps
# You should see: mongo and redis containers

# Optional: View logs
docker-compose logs -f mongo
docker-compose logs -f redis
```

**What's running now:**
- MongoDB on `mongodb://localhost:27017` (test database)
- Redis on `redis://localhost:6379`

---

## Step 3: Setup Environment Files (2 minutes)

Create `.env` files from examples:

```bash
# Copy environment templates
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/stellar-service/.env.example apps/stellar-service/.env

# Update key values (for local development)
# Edit apps/api/.env:
MONGO_URI=mongodb://localhost:27017/health_watchers
REDIS_URL=redis://localhost:6379
JWT_ACCESS_TOKEN_SECRET=dev-secret-32-chars-long-change-prod
STELLAR_NETWORK=testnet
STELLAR_DRY_RUN=true
```

**Don't worry about**:
- `STELLAR_SECRET_KEY` (dev uses dry-run mode)
- `AWS_*` variables (S3 optional locally)
- `SMTP_*` (email optional, falls back to no-op)

---

## Step 4: Seed Development Data (3 minutes)

Populate database with realistic test data:

```bash
cd apps/api

# Create admin user
npm run seed:admin
# Output: Admin user created
# Email: admin@health-watchers.test
# Password: admin123456

# Create test patients & encounters
npm run seed:patients --count=10
# Output: Created 10 test patients with encounters and lab results

# Create test clinic
npm run seed:clinic
# Output: Clinic created for testing
```

**Test credentials:**
```
Admin Login:
  Email: admin@health-watchers.test
  Password: admin123456

Doctor Login (created by seed):
  Email: doctor@health-watchers.test
  Password: doctor123456

Patient Login (created by seed):
  Email: patient@health-watchers.test
  Password: patient123456
```

---

## Step 5: Start Development Servers (2 minutes)

In a **third terminal window** (from root directory):

```bash
# Terminal 1: APIs
npm run dev:api
# Output: API server running at http://localhost:3001

# Terminal 2: Web
npm run dev:web
# Output: Web app running at http://localhost:3000

# Terminal 3: Stellar Service (optional, for payment testing)
npm run dev:stellar
# Output: Stellar service running at http://localhost:3002
```

**Troubleshooting**: If ports are in use, kill the process:
```bash
lsof -i :3001  # Find process using port 3001
kill -9 <PID>  # Kill it
```

---

## Step 6: Verify Everything Works (2 minutes)

### Visit the Web App
```
http://localhost:3000
```

**Expected**:
- Login page loads
- Type admin@health-watchers.test / admin123456
- Dashboard shows test patients

### Test the API Directly
```bash
# Get access token
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@health-watchers.test","password":"admin123456"}'

# Response:
{
  "status": "success",
  "data": {
    "accessToken": "eyJhbGc...",
    "user": { "id": "...", "email": "admin@health-watchers.test" }
  }
}

# List patients (replace TOKEN with actual token)
curl -X GET http://localhost:3001/api/v1/patients \
  -H "Authorization: Bearer TOKEN"
```

**Expected**: Returns list of test patients with full details

---

## Making Your First Change

### Example: Add a debug log to the dashboard

1. **Open the web app**
   ```
   open http://localhost:3000
   ```

2. **Find the file**
   ```
   apps/web/src/pages/dashboard.tsx
   ```

3. **Add a log (line ~50)**
   ```typescript
   console.log('Dashboard loaded at:', new Date());
   ```

4. **Save the file** — hot reload happens automatically

5. **Check your browser console** — you should see the log

---

## Common Workflows

### Running Tests

```bash
cd apps/api

# Unit tests (fast)
npm run test:unit

# Integration tests (slower, uses real MongoDB)
npm run test:integration

# All tests with coverage
npm run test:coverage
```

### Making API Changes

```bash
# 1. Modify endpoint in apps/api/src/routes/
# 2. The dev server auto-restarts (hot reload)
# 3. Test with curl or Postman

curl http://localhost:3001/api/v1/patients
```

### Making Frontend Changes

```bash
# 1. Edit apps/web/src/components/
# 2. Browser auto-reloads (via Next.js)
# 3. No restart needed
```

### Checking Database

```bash
# Access MongoDB shell
docker exec -it health_watchers-mongo mongosh

# List databases
show dbs

# Use test database
use health_watchers

# See patient data
db.patients.findOne()

# Count patients
db.patients.countDocuments()
```

---

## Understanding the Architecture

Read these in order:

1. **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** (5 min read)
   - Diagram of all components
   - How data flows between services
   - Technology stack

2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** (10 min read)
   - Design patterns
   - Module organization
   - Code structure

3. **[CONTRIBUTING.md](../CONTRIBUTING.md)** (5 min read)
   - Code style guide
   - Git workflow
   - PR requirements

---

## Important: PHI Handling (HIPAA)

**Health Watchers handles Protected Health Information (PHI)**. Before coding:

1. **Read**: [HIPAA_COMPLIANCE_CHECKLIST.md](./HIPAA_COMPLIANCE_CHECKLIST.md) (5 min)
   - Which fields are encrypted
   - When to log access
   - Common mistakes to avoid

2. **Remember**:
   - ❌ Don't log patient SSN or medical data
   - ✅ Do log patient ID and action type
   - ❌ Don't store passwords in comments
   - ✅ Do use environment variables
   - ❌ Don't commit `.env` files
   - ✅ Do use `.env.example` as template

---

## Debugging Tips

### "API won't start"
```bash
# Check if port 3001 is in use
lsof -i :3001

# Check if MongoDB is running
docker ps | grep mongo

# View API logs
cd apps/api && npm run dev:api

# Look for the error message
```

### "Database connection timeout"
```bash
# Verify MongoDB is running
docker-compose ps

# Restart it
docker-compose down
docker-compose up -d mongo
```

### "Changes not appearing"
```bash
# API changes: Server should auto-restart
# Web changes: Browser should auto-reload

# If not, manually restart:
# Kill the process and run npm run dev:api / dev:web again
```

### "Test data missing"
```bash
# Re-seed the database
cd apps/api
npm run seed:patients --count=10

# Or completely reset
npm run db:drop
npm run seed:admin
npm run seed:patients
```

---

## Next Steps

Once you're comfortable with the local setup:

1. **Pick an issue** from GitHub Issues
   - Look for labels: `good-first-issue`, `help-wanted`
   - Start with small bugs or documentation

2. **Create a branch**
   ```bash
   git checkout -b fix/issue-123-short-description
   ```

3. **Make your changes**
   - Edit files
   - Add tests
   - Run tests locally

4. **Commit & push**
   ```bash
   git add .
   git commit -m "Fix issue #123: short description"
   git push origin fix/issue-123-short-description
   ```

5. **Create a Pull Request**
   - GitHub will suggest creating a PR
   - Fill in the template
   - Assign a reviewer

6. **Code review**
   - Maintainers will review
   - Make requested changes
   - Iterate until approved

7. **Merge & celebrate** 🎉

---

## Getting Help

- **Questions about setup?** Open an issue labeled `help-wanted`
- **Stuck on a task?** Ask in GitHub Discussions
- **Found a bug?** Report it on GitHub Issues
- **HIPAA questions?** See HIPAA_COMPLIANCE_CHECKLIST.md
- **Architecture questions?** See SYSTEM_ARCHITECTURE.md

---

## Quick Reference

```bash
# Database & Cache
docker-compose up -d          # Start
docker-compose down           # Stop
docker-compose logs -f        # View logs

# Development servers (each in separate terminal)
npm run dev:api              # Express API
npm run dev:web              # Next.js web
npm run dev:stellar          # Stellar service

# Testing
npm run test:unit            # Unit tests
npm run test:integration     # Integration tests
npm run test:coverage        # With coverage

# Database seeding
npm run seed:admin           # Create admin
npm run seed:patients        # Create test patients
npm run db:drop              # Drop all collections

# Git workflow
git checkout -b fix/issue-123-description
# ... make changes ...
git add .
git commit -m "Fix issue #123: description"
git push origin fix/issue-123-description
# Create PR via GitHub UI
```

---

## Success Indicators

You'll know everything is working when:

✅ `npm install` completes without errors  
✅ Docker containers show running (`docker ps`)  
✅ `http://localhost:3000` loads without errors  
✅ You can log in with test credentials  
✅ Dashboard shows test patients  
✅ Database seeding outputs success messages  
✅ Tests pass (`npm run test:unit`)  
✅ You make a small code change and see it reflected  

**You're ready to contribute!** 🚀

