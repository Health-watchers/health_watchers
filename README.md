# Health Watchers

> **Note**: Replace `OWNER` in the badge URLs below with your GitHub username or organization name.

[![CI Status](https://github.com/OWNER/health-watchers/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/health-watchers/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/OWNER/health-watchers/branch/main/graph/badge.svg)](https://codecov.io/gh/OWNER/health-watchers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![npm Version](https://img.shields.io/badge/npm-10.9.2-blue.svg)](https://www.npmjs.com/)

A HIPAA-compliant healthcare management platform built with Next.js, Express, and Stellar blockchain integration for secure patient data management and payment processing.

## Features

- 🏥 Patient management with comprehensive health records
- 📅 Medical encounter tracking and documentation
- 💳 Blockchain-based payment processing via Stellar
- 🔐 HIPAA-compliant authentication and authorization
- 🌐 Internationalization support (English, French)
- 🎨 Modern, accessible UI with Tailwind CSS
- 🔄 Real-time data synchronization with React Query

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: MongoDB
- **Blockchain**: Stellar (testnet/mainnet)
- **Authentication**: JWT with refresh tokens
- **Monorepo**: npm workspaces with Turbo

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm 10.9.2
- Docker and Docker Compose

### Quick Start — MongoDB only (recommended for local dev)

No local MongoDB installation required. Spin up just the database:

```bash
# 1. Clone the repository
git clone https://github.com/OWNER/health-watchers.git
cd health-watchers

# 2. Copy environment configuration
cp .env.example .env

# 3. Start MongoDB (and optional mongo-express UI on :8081)
docker-compose -f docker-compose.dev.yml up -d

# 4. Install dependencies and start the API
npm install
npm run dev --workspace=api
```

The default `MONGO_URI=mongodb://localhost:27017/health_watchers` in `.env.example` connects directly to the containerized MongoDB — no credentials needed for local dev.

To stop:
```bash
docker-compose -f docker-compose.dev.yml down
```

### 5-Minute Quickstart — Full Stack with Docker Compose

Runs all services (API, web, stellar-service, MongoDB) in containers:

```bash
# 1. Clone the repository
git clone https://github.com/OWNER/health-watchers.git
cd health-watchers

# 2. Copy environment configuration
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Access the application
# Web UI: http://localhost:3000
# API: http://localhost:3001
```

To stop all services:
```bash
docker-compose down
```

### Manual Setup

If you prefer to run services individually:

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 3. Start MongoDB (if not using Docker)
# macOS: brew services start mongodb-community
# Linux: sudo systemctl start mongod
# Windows: net start MongoDB

# 4. Seed the database (optional)
npm run seed

# 5. Start development servers
npm run dev
```

This will start:
- Web app on http://localhost:3000
- API server on http://localhost:3001
- Stellar service on http://localhost:3002

## Project Structure

```
health-watchers/
├── apps/
│   ├── api/              # Express.js REST API
│   ├── web/              # Next.js frontend application
│   └── stellar-service/  # Stellar blockchain integration
├── packages/             # Shared packages (types, utils)
├── scripts/              # Database seeding and utilities
├── .env.example          # Environment configuration template
└── docker-compose.yml    # Docker orchestration
```

## Development

### Available Scripts

```bash
npm run dev      # Start all apps in development mode
npm run build    # Build all apps for production
npm run start    # Start all apps in production mode
npm run lint     # Run linting across all apps
npm run seed     # Seed database with sample data
```

### Environment Variables

See `.env.example` for a complete list of required environment variables. Key variables include:

- `MONGO_URI` - MongoDB connection string
- `JWT_ACCESS_TOKEN_SECRET` - JWT signing secret
- `STELLAR_NETWORK` - Stellar network (testnet/mainnet)
- `GEMINI_API_KEY` - Google Gemini API for AI features
- `NEXT_PUBLIC_API_URL` - API endpoint for frontend

## Security & Compliance

Health Watchers is designed with HIPAA compliance in mind:

- 🔒 End-to-end encryption for sensitive data
- 🔑 Secure JWT-based authentication
- 📝 Comprehensive audit logging
- 🔄 Regular security updates and dependency scanning
- 🛡️ Input validation and sanitization
- 🔐 Secrets management with AWS Secrets Manager support

For detailed security guidelines, see `SECURITY.md`.

## Database Migrations

Health Watchers uses [migrate-mongo](https://github.com/seppevs/migrate-mongo) to version-control MongoDB schema changes. All migrations live in `apps/api/src/migrations/` and are written in TypeScript.

### Available Commands

Run from the repo root (or inside `apps/api/`):

```bash
# Apply all pending migrations
npm run migrate:up --workspace=api

# Roll back the last applied migration
npm run migrate:down --workspace=api

# Show migration status (applied / pending)
npm run migrate:status --workspace=api

# Scaffold a new migration file
npm run migrate:create --workspace=api -- <migration-name>
```

### How It Works

- migrate-mongo tracks applied migrations in the `changelog` collection in MongoDB.
- Migrations run in filename order (lexicographic), so prefix files with a date: `YYYYMMDD_description.ts`.
- Every migration **must** export both `up` and `down` functions — `down` must reverse what `up` does.
- All `up` operations use idempotent MongoDB operations (e.g. `createIndex` with a named index, `updateMany` with `$exists` guards) so they are safe to re-run.

### Writing a Migration

```ts
// apps/api/src/migrations/20240201_example.ts
import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.collection('patients').createIndex(
    { clinicId: 1, isActive: 1 },
    { background: true, name: 'clinicId_1_isActive_1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').dropIndex('clinicId_1_isActive_1').catch(() => {});
}
```

### CI / Deployment

- `migrate:up` runs automatically in the CI `test` job before the test suite (see `.github/workflows/ci.yml`).
- Run `migrate:up` as part of your deployment pipeline before starting the API server to ensure the database schema is always up to date.

### Rollback Strategy

If a migration causes issues in production:

1. Run `npm run migrate:down --workspace=api` to revert the last migration.
2. Fix the migration file.
3. Re-run `npm run migrate:up --workspace=api`.

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Deployment

### Docker Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Production Deployment

```bash
# Build all applications
npm run build

# Start production servers
npm run start
```

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For questions, issues, or feature requests:

- 📧 Email: support@healthwatchers.com
- 🐛 Issues: [GitHub Issues](https://github.com/OWNER/health-watchers/issues)
- 📖 Documentation: [Wiki](https://github.com/OWNER/health-watchers/wiki)

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Blockchain integration powered by [Stellar](https://stellar.org/)
- UI components inspired by modern design systems
- HIPAA compliance guidance from healthcare industry standards

---

Made with ❤️ by the Health Watchers team
