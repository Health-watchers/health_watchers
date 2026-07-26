# Architecture Overview

Health Watchers is built as a monorepo with three main applications and shared packages.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Application                         │
│                    (Next.js + React)                        │
│                   http://localhost:3000                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway                              │
│                   (Express.js)                              │
│                   http://localhost:3001                     │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    ┌────────┐      ┌──────────┐    ┌──────────────┐
    │ MongoDB│      │ Stellar  │    │ AI Service   │
    │        │      │ Service  │    │ (Gemini)     │
    └────────┘      └──────────┘    └──────────────┘
```

## Project Structure

```
health-watchers/
├── apps/
│   ├── api/              # Express.js REST API
│   ├── web/              # Next.js frontend
│   ├── stellar-service/  # Stellar blockchain integration
│   └── docs/             # Docusaurus documentation
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── config/           # Shared configuration
│   └── anonymize/        # Data anonymization utilities
├── scripts/              # Database seeding and utilities
├── k6/                   # Load testing scripts
└── docker-compose.yml    # Docker orchestration
```

## Service Communication

### API to Database
- MongoDB connection via Mongoose ODM
- Connection pooling for performance
- Automatic retry logic

### API to Stellar Service
- HTTP REST calls for payment processing
- Async job queue for long-running operations
- Webhook callbacks for transaction confirmations

### API to AI Service
- Gemini API for clinical summaries
- Triage assessment
- Differential diagnosis
- Dosage calculations

## Data Flow

### Patient Registration
1. User submits registration form (Web)
2. API validates and creates user account
3. Patient record created in MongoDB
4. Confirmation email sent

### Encounter Creation
1. Clinician creates encounter (Web)
2. API stores encounter with patient reference
3. Optional: AI generates clinical summary
4. Audit log recorded

### Payment Processing
1. Patient initiates payment (Web)
2. API creates payment intent
3. Stellar Service processes transaction
4. Webhook confirms transaction
5. Payment record updated in MongoDB

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Express.js, Node.js, TypeScript |
| Database | MongoDB |
| Blockchain | Stellar (testnet/mainnet) |
| Authentication | JWT with refresh tokens |
| AI | Google Gemini API |
| Monorepo | npm workspaces, Turbo |

## Deployment Architecture

```
┌──────────────────────────────────────────┐
│         GitHub Actions CI/CD             │
└──────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │ Docker │ │ Tests  │ │ Lint   │
    │ Build  │ │ & Cov  │ │ & Type │
    └────────┘ └────────┘ └────────┘
        │
        ▼
    ┌──────────────────────────┐
    │  Container Registry      │
    │  (Docker Hub / ECR)      │
    └──────────────────────────┘
        │
        ▼
    ┌──────────────────────────┐
    │  Kubernetes Cluster      │
    │  (Production)            │
    └──────────────────────────┘
```

## See Also

- [Monorepo Structure](./monorepo-structure.md)
- [Service Communication](./service-communication.md)
- [Data Flow](./data-flow.md)
