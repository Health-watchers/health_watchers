# Health Watchers

[![CI/CD Pipeline](https://github.com/Health-watchers/health_watchers/actions/workflows/ci.yml/badge.svg)](https://github.com/Health-watchers/health_watchers/actions/workflows/ci.yml)
[![Docs](https://github.com/Health-watchers/health_watchers/actions/workflows/docs.yml/badge.svg)](https://github.com/Health-watchers/health_watchers/actions/workflows/docs.yml)
[![Lighthouse CI](https://github.com/Health-watchers/health_watchers/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/Health-watchers/health_watchers/actions/workflows/lighthouse.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![npm Version](https://img.shields.io/badge/npm-10.9.2-blue.svg)](https://www.npmjs.com/)

A HIPAA-compliant healthcare management platform built with Next.js, Express, and Stellar blockchain integration for secure patient data management and payment processing.

## Documentation

- **Documentation site**: [`apps/docs`](apps/docs/README.md) (Docusaurus). It has module guides for every API module and a User Guide for clinic staff, and is published to GitHub Pages by the [Docs workflow](.github/workflows/docs.yml). Run it locally with `cd apps/docs && npm ci && npm start`.
- **Engineering docs index**: [`docs/README.md`](docs/README.md)
- **Contributing**: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Security policy**: [`SECURITY.md`](SECURITY.md)
- **Changelog**: [`CHANGELOG.md`](CHANGELOG.md)

## Features

- 🏥 Patient management with comprehensive health records
- 📅 Medical encounter tracking and documentation
- 💳 Blockchain-based payment processing via Stellar
- 🔐 HIPAA-compliant authentication and authorization
- 🌐 Internationalization support (English, French)
- 🎨 Modern, accessible UI with Tailwind CSS
- 🌙 Dark mode support with persistent theme preference
- 🔄 Real-time data synchronization with React Query

## Dark Mode

Health Watchers ships with a full dark theme across every page — dashboards, patient cards,
payment tables, CDS panels, encounter forms, the portal subsection, and charts
(`VitalSignsChart`, `PaymentAnalyticsCharts`).

Toggle the theme from the header using the sun/moon button (`ThemeToggle`). The choice is
persisted in `localStorage` and re-applied on load by `ThemeSync`, so your preference survives
reloads and new sessions. If no preference is stored, the app follows your OS setting.

![Health Watchers dashboard in dark mode](docs/assets/dark-mode-dashboard.png)

*Dashboard in dark mode — charts, tables, and cards all use `dark:` Tailwind variants.*

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

### Quick Start with Docker Compose Profiles

We've consolidated all Docker Compose configurations into a single file with profiles. Choose what you need:

#### Development Environment (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/Health-watchers/health_watchers.git
cd health_watchers

# 2. Copy environment configuration
cp .env.example .env

# 3. Start development services using docker-compose.dev.yml
# Includes: MongoDB, Redis, API, Web
docker compose -f docker-compose.dev.yml up -d

# 4. Access the application
# Web UI: http://localhost:3000
# API: http://localhost:3001
# MongoDB: localhost:27017
# Redis: localhost:6379
```

**Why Redis in Development?**

Redis is now required in the development environment for:
- Rate limiting (prevents abuse, tracks API usage)
- Session caching (faster authentication)
- Idempotency keys (prevents duplicate payments)

Without Redis, some features will fail. The dev environment mirrors production more closely.

#### Core Services Only

```bash
# Start core + Jaeger for distributed tracing
docker compose --profile core up -d

# Web UI: http://localhost:3000
# API: http://localhost:3001
# Jaeger UI: http://localhost:16686
```

#### With Development Tools

```bash
# Start core + mongo-express (database UI on :8081)
docker compose --profile core --profile dev-tools up -d
```

#### With Monitoring Stack

```bash
# Start core + Prometheus, Grafana, AlertManager
docker compose --profile core --profile monitoring up -d

# Grafana: http://localhost:3003 (admin/admin)
# Prometheus: http://localhost:9090
```

#### Full Stack with ELK Logging

```bash
# Start core + Elasticsearch, Logstash, Kibana
docker compose --profile core --profile elk up -d

# Kibana: http://localhost:5601
```

#### MongoDB Replica Set (High Availability)

```bash
# Use replica profile instead of core (which has standalone MongoDB)
docker compose --profile replica --profile dev-tools up -d

# Update MONGO_URI in .env:
# MONGO_URI=mongodb://admin:password123@mongodb-primary:27017,mongodb-secondary-1:27017,mongodb-secondary-2:27017/health_watchers?replicaSet=rs0&authSource=admin
```

#### Production Deployment

```bash
# Use production overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile core up -d

# Ensure all production secrets are set in .env
```

To stop services:
```bash
docker compose --profile core down
# or
docker compose down  # stops all running services
```

### Available Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| `core` | API, web, stellar-service, MongoDB, Redis, Jaeger | Development, basic setup |
| `dev-tools` | mongo-express | Database management UI |
| `monitoring` | Prometheus, Grafana, AlertManager, node-exporter | Metrics and alerts |
| `elk` | Elasticsearch, Logstash, Kibana | Centralized logging |
| `replica` | MongoDB replica set (3 nodes + arbiter) | HA testing |
| `stellar` | Stellar-specific services | Blockchain development |

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

### IDE Setup

See [`docs/IDE_SETUP.md`](docs/IDE_SETUP.md) for recommended VS Code extensions, formatter/linter integration, and a debugger launch config for `apps/api`.

## Project Structure

```
health_watchers/
├── apps/
│   ├── api/              # Express.js REST API (modules, migrations, jobs)
│   ├── web/              # Next.js web application (staff app + patient portal)
│   ├── mobile/           # React Native (Expo) mobile app
│   ├── stellar-service/  # Stellar blockchain integration service
│   └── docs/             # Docusaurus documentation site
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── config/           # Shared ESLint and tooling configuration
│   └── anonymize/        # PHI de-identification utilities
├── contracts/            # Soroban smart contracts (e.g. escrow)
├── docs/                 # Engineering, operations and compliance docs (see docs/README.md)
├── k8s/                  # Kubernetes manifests
├── helm/                 # Helm chart
├── terraform/            # Infrastructure as code
├── monitoring/           # Prometheus, Alertmanager and Grafana configuration
├── k6/                   # k6 load, stress and spike tests
├── scripts/              # Seeding, security, DR and utility scripts
├── .env.example          # Environment configuration template
└── docker-compose.yml    # Docker Compose with profiles
```

## Development

### Available Scripts

```bash
npm run dev      # Start all apps in development mode
npm run build    # Build all apps for production
npm run start    # Start all apps in production mode
npm run lint     # Run linting across all apps
npm run seed     # Seed database with sample data
npm run test     # Run all tests across monorepo
```

### Testing

Health Watchers has comprehensive test coverage across multiple test types. See [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) for the complete testing guide.

**Quick Start:**

```bash
# Run all tests
npm run test

# API tests
npm run test --workspace=api                    # Unit tests
npm run test:integration --workspace=api        # Integration tests (with DB isolation)
npm run test:coverage --workspace=api           # With coverage report

# Web tests
npm run test --workspace=web                    # Unit tests
npm run test:e2e --workspace=web                # E2E tests with Playwright

# Mobile tests
npm run test --workspace=mobile                 # React Native tests
```

**Key Testing Features:**

- **Database Isolation**: Integration tests use `mongodb-memory-server` for per-test DB isolation
- **Fixture Factories**: Type-safe test data builders (Patient, User, Payment, Encounter, Clinic)
- **Serial Execution**: Integration tests run with `--runInBand` to ensure complete isolation
- **Comprehensive Security Tests**: HIPAA-compliant security header validation
- **Mobile Testing**: Full Jest + React Native Testing Library setup with mocked Expo modules

**Test Structure:**

- `apps/api/src/__tests__/` - Integration tests
- `apps/api/src/**/__tests__/` - Unit tests
- `apps/web/e2e/` - Playwright E2E tests
- `apps/mobile/src/**/__tests__/` - Mobile unit and component tests

**Minimum Coverage Requirements:**

- Global: 80% lines, 80% branches
- Payments module: 85% lines, 85% branches
- Auth module: 85% lines, 85% branches

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

For detailed security guidelines, see [`SECURITY.md`](SECURITY.md) and [`docs/SECURITY_POLICY.md`](docs/SECURITY_POLICY.md). For day-to-day rules on handling patient data in code, see [`docs/PHI_HANDLING_GUIDE.md`](docs/PHI_HANDLING_GUIDE.md); for onboarding a new vendor that will touch PHI, see [`docs/BAA_TEMPLATE.md`](docs/BAA_TEMPLATE.md).

## Logging & Tracing

The API uses Pino for structured logging and OpenTelemetry for distributed tracing, with correlation IDs tying logs, traces, and audit entries together for a single request. See [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) for the full guide, including log levels, redaction rules, and tracing/sampling configuration.

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

We welcome contributions! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide. In short:

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
- 🐛 Issues: [GitHub Issues](https://github.com/Health-watchers/health_watchers/issues)
- 📖 Documentation: [Documentation site](apps/docs/README.md) and [docs index](docs/README.md)

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Blockchain integration powered by [Stellar](https://stellar.org/)
- UI components inspired by modern design systems
- HIPAA compliance guidance from healthcare industry standards

---

Made with ❤️ by the Health Watchers team

## API Documentation

### Swagger / OpenAPI
Interactive docs are available at `/api/docs` when the server is running.

### Postman Collection
Import the collection and environment from [`docs/postman/`](./docs/postman/) to get started immediately.

| File | Purpose |
|------|---------|
| `health-watchers.postman_collection.json` | All API requests with pre-request auth scripts |
| `health-watchers.postman_environment.json` | Environment variables template |

**Quick start:**
1. Import both files into Postman
2. Set `admin_email` and `admin_password` in the environment
3. Run **Auth → Login** — `jwt_token` is set automatically
4. All subsequent requests use the token via collection-level bearer auth

**Public workspace:** [Run in Postman](https://www.postman.com/health-watchers/workspace/health-watchers-api) *(publish via CI by setting `POSTMAN_API_KEY` and `POSTMAN_COLLECTION_UID` secrets)*

The collection is validated on every PR and synced to the public workspace on every merge to `main` (see `.github/workflows/ci.yml` — `postman-sync` job).

## Architecture Documentation

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full system design — component
architecture, data flows, deployment topology, security, and observability — with diagrams
rendered inline via Mermaid. The diagram sources live in [`docs/diagrams/`](./docs/diagrams/).
