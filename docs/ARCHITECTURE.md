# System Architecture

## Overview

Health Watchers is a HIPAA-compliant healthcare management platform built with a microservices architecture. This document provides comprehensive system design, component relationships, and deployment topology.

## High-Level Architecture Diagram

```mermaid
%% System Architecture - high-level component diagram
%% Mirrors docs/ARCHITECTURE.md "High-Level Architecture Diagram"
flowchart TB
    subgraph Client["Client Layer"]
        WEB["Web (Next.js)"]
        MOBILE["Mobile (React Native)"]
        API_CONSUMERS["API Consumers"]
    end

    subgraph Gateway["API Gateway / Load Balancer (NGINX)"]
        NGINX["SSL/TLS Termination<br/>Request Routing<br/>Rate Limiting"]
    end

    subgraph Services["Service Layer (Kubernetes)"]
        API_SVC["API Service (Express)<br/>Auth · Patients · Encounters"]
        STELLAR_SVC["Stellar Service (Payments)<br/>Transactions · Blockchain · Settlements"]
        REDIS["Cache Layer (Redis)"]
    end

    subgraph Data["Data Layer"]
        MONGO[("MongoDB<br/>(Replica Set)")]
        STELLAR_NET(("Stellar Network<br/>(Testnet / Live)"))
        RABBITMQ[("Message Queue<br/>(RabbitMQ)")]
    end

    WEB --> NGINX
    MOBILE --> NGINX
    API_CONSUMERS --> NGINX

    NGINX --> API_SVC
    NGINX --> STELLAR_SVC
    NGINX --> REDIS

    API_SVC --> MONGO
    API_SVC --> RABBITMQ
    API_SVC --> REDIS

    STELLAR_SVC --> STELLAR_NET
    STELLAR_SVC --> MONGO
```

Source: [`docs/diagrams/system-architecture.mmd`](diagrams/system-architecture.mmd)

## Component Architecture

### 1. Frontend Layer

**Web Application (Next.js)**
- Framework: Next.js 14 with React 18
- Rendering: Server-side rendering (SSR) and static generation
- State Management: React Query for server state
- Styling: Tailwind CSS
- Internationalization: i18n for EN/FR support
- Authentication: JWT tokens with refresh mechanism

**Mobile Application (React Native)**
- Cross-platform support (iOS/Android)
- Offline-first capabilities with local storage
- Deep linking support
- Push notifications integration

### 2. API Gateway / Load Balancer

**NGINX Configuration**
```
- SSL/TLS termination
- Request routing to services
- Rate limiting (10,000 req/min)
- Gzip compression
- Cache headers management
```

### 3. Application Services

#### API Service (Express.js)
```
Port: 3001
Handlers:
├── Authentication & Authorization
│   ├── JWT validation
│   ├── Role-based access control (RBAC)
│   └── Multi-factor authentication
├── Patient Management
│   ├── CRUD operations
│   ├── Health records
│   └── Document storage
├── Medical Encounters
│   ├── Appointment scheduling
│   ├── Consultation notes
│   └── Outcome tracking
└── Audit Logging
    ├── All mutations
    └── Access tracking
```

#### Stellar Service (Payment Processing)
```
Port: 3002
Handlers:
├── Account Management
│   ├── Keypair generation
│   ├── Balance queries
│   └── Account creation
├── Transaction Processing
│   ├── Payment submission
│   ├── Multi-signature validation
│   └── Transaction tracking
└── Settlement Management
    ├── Daily reconciliation
    └── Dispute handling
```

**Internal Component Map**

The diagram below shows how the modules inside `apps/stellar-service` (transaction building,
payment streaming, reconciliation, cold wallet, mainnet safety checks, etc.) connect to the main
API and to the Stellar Horizon API/network, grounded in the actual imports in
`apps/stellar-service/src`.

```mermaid
%% apps/stellar-service internals and how they connect to the main API and Horizon
%% Edges are grounded in actual imports in apps/stellar-service/src
flowchart LR
    API["Express API (apps/api)"]

    subgraph StellarService["Stellar Service (apps/stellar-service)"]
        INDEX["index.ts<br/>Express HTTP layer"]
        STELLAR["stellar.ts<br/>core Horizon operations"]
        HORIZON_CLIENT["horizon-client.ts<br/>ResilientHorizonClient"]
        PAYMENT_STREAM["payment-stream.ts"]
        STATE_MACHINE["payment-state-machine.ts"]
        RECONCILIATION["payment-reconciliation.ts"]
        BATCH["batch-processor.ts"]
        FEE_CALC["fee-calculator.ts"]
        EXCHANGE["exchange-rates.ts"]
        COLD_WALLET["cold-wallet.ts"]
        MAINNET_SAFETY["mainnet-safety.ts"]
        NETWORK_MONITOR["network-monitor.ts"]
        CLAIMABLE["operations/claimable-balance.ts"]
        ESCROW["operations/escrow.ts"]
    end

    HORIZON["Stellar Horizon API"]
    NETWORK(("Stellar Network"))

    API -->|"HTTP: payments, balances, refunds"| INDEX

    INDEX --> STELLAR
    INDEX --> CLAIMABLE
    INDEX --> ESCROW
    INDEX --> STATE_MACHINE
    INDEX --> MAINNET_SAFETY
    INDEX --> EXCHANGE
    INDEX --> BATCH
    INDEX --> PAYMENT_STREAM
    INDEX --> FEE_CALC
    INDEX --> NETWORK_MONITOR
    INDEX --> RECONCILIATION
    INDEX --> COLD_WALLET

    STELLAR --> BATCH
    STELLAR --> HORIZON_CLIENT
    CLAIMABLE --> STELLAR
    ESCROW --> STELLAR
    NETWORK_MONITOR --> STELLAR
    RECONCILIATION --> STELLAR

    HORIZON_CLIENT --> HORIZON
    PAYMENT_STREAM --> HORIZON
    HORIZON --> NETWORK
```

Source: [`docs/diagrams/stellar-integration-components.mmd`](diagrams/stellar-integration-components.mmd)

#### Redis Cache Layer
```
Port: 6379
Usage:
├── Session storage
├── Rate limiting counters
├── Real-time data caching
└── Queue management
```

### 4. Data Layer

**MongoDB**
- Replica Set for high availability
- Primary: Active read/write
- Secondary: Read replicas for distribution
- Collections:
  - `patients`: Patient demographics and health records
  - `encounters`: Medical encounter documentation
  - `transactions`: Payment/blockchain transactions
  - `audit_logs`: Comprehensive audit trail
  - `users`: User accounts and credentials

**Stellar Blockchain**
- Testnet for development/staging
- Mainnet for production
- Custom token: Healthcare tokens (HWT)

**RabbitMQ Message Queue**
- Asynchronous job processing
- Email notifications
- Audit log batching
- Report generation

### 5. Security Architecture

**Authentication Flow**
```
User → Login → JWT Generation → Token Storage → Authenticated Requests
                     ↓
            Refresh Token (7 days)
```

**Encryption**
- TLS 1.3 for transport
- AES-256-GCM for data at rest
- Sensitive fields hashed (PII)

**Access Control**
```
User Role → Permission Set → Resource Access
├── Admin: Full system access
├── Doctor: Patient management + encounter creation
├── Nurse: Encounter support + data entry
└── Patient: Own record view
```

## Data Flow Diagrams

### Patient Registration Flow

```mermaid
%% Patient Registration data flow
%% Mirrors docs/ARCHITECTURE.md "Patient Registration Flow"
flowchart TD
    A["Patient Web"] -->|"POST /patients"| B["API Gateway"]
    B -->|"Validate request"| C["Express API<br/>- Validate data<br/>- Hash PII<br/>- Create record"]
    C -->|"Insert"| D[("MongoDB<br/>patients collection")]
    D -->|"Emit event"| E["RabbitMQ<br/>- Send email<br/>- Audit log"]
```

Source: [`docs/diagrams/data-flow-patient-management.mmd`](diagrams/data-flow-patient-management.mmd)

For the detailed message-level sequence (gateway forwarding, DB acknowledgement, event
publication), see the companion sequence diagram:

```mermaid
%% POST /patients sequence
sequenceDiagram
    actor Client
    participant Gateway as API Gateway (NGINX)
    participant API as Express API
    participant DB as MongoDB
    participant MQ as RabbitMQ

    Client->>Gateway: POST /patients
    Gateway->>API: Forward request
    API->>API: Validate data
    API->>API: Hash PII
    API->>DB: Insert patient record
    DB-->>API: Acknowledge insert
    API->>MQ: Publish "patient.created" event
    MQ->>MQ: Send email notification
    MQ->>MQ: Write audit log
    API-->>Gateway: 201 Created
    Gateway-->>Client: 201 Created
```

Source: [`docs/diagrams/sequence-patient-registration.mmd`](diagrams/sequence-patient-registration.mmd)

### Payment Processing Flow

```mermaid
%% Payment Processing data flow
%% Mirrors docs/ARCHITECTURE.md "Payment Processing Flow"
flowchart TD
    A["Patient Checkout"] -->|"POST /payments"| B["API Gateway"]
    B --> C["Express API<br/>- Validate amount<br/>- Create invoice"]
    C --> D["Stellar Service<br/>- Build tx<br/>- Multi-sig check<br/>- Submit to network"]
    D --> E["Stellar Network<br/>Confirm payment"]
    E --> F["Settlement Queue"]
    F -->|"Daily reconciliation"| G["Bank Integration"]
```

Source: [`docs/diagrams/data-flow-payments-blockchain.mmd`](diagrams/data-flow-payments-blockchain.mmd)

For the detailed message-level sequence (transaction build, multi-sig check, Horizon submission,
reconciliation stream), see the companion sequence diagram:

```mermaid
%% POST /payments sequence
sequenceDiagram
    actor Client
    participant API as Express API
    participant Stellar as Stellar Service
    participant Horizon as Stellar Network (Horizon)
    participant Recon as Reconciliation

    Client->>API: POST /payments
    API->>API: Validate amount, create invoice
    API->>Stellar: Request payment submission
    Stellar->>Stellar: Build transaction
    Stellar->>Stellar: Multi-sig check
    Stellar->>Horizon: Submit transaction
    Horizon-->>Stellar: Transaction confirmed
    Stellar-->>API: Payment confirmed
    API-->>Client: 200 OK (payment confirmed)
    Horizon->>Recon: Ledger transaction stream
    Recon->>Recon: Daily reconciliation
```

Source: [`docs/diagrams/sequence-payment-processing.mmd`](diagrams/sequence-payment-processing.mmd)

### Authentication Flow

```mermaid
%% Authentication flow: login, MFA, token issuance, refresh
%% Based on apps/api/src/modules/auth/auth.controller.ts
sequenceDiagram
    actor Client
    participant API as Express API
    participant DB as MongoDB (users)
    participant MQ as RabbitMQ

    Client->>API: POST /auth/login (email, password)
    API->>DB: Find user by email
    DB-->>API: User record
    API->>API: bcrypt.compare(password, hash)

    alt MFA enabled
        API-->>Client: 200 { status: "mfa_required", tempToken }
        Client->>API: POST /auth/mfa/verify (tempToken, TOTP code)
        API->>API: Verify TOTP code
    end

    API->>API: signAccessToken (15m) + signRefreshToken (7d, family/jti)
    API->>DB: Store refresh token record
    API->>MQ: Publish audit log entry
    API-->>Client: 200 { accessToken, refreshToken }

    Client->>API: GET /patients (Authorization: Bearer accessToken)
    API->>API: Verify JWT signature + expiry
    API-->>Client: 200 OK

    Note over Client,API: accessToken expires after 15 minutes
    Client->>API: POST /auth/refresh { refreshToken }
    API->>DB: Verify + rotate refresh token (jti/family)
    DB-->>API: OK
    API->>API: Issue new accessToken + refreshToken
    API-->>Client: 200 { accessToken, refreshToken }
```

Source: [`docs/diagrams/auth-flow.mmd`](diagrams/auth-flow.mmd)

## Deployment Architecture

### Kubernetes Topology

```yaml
Namespace: health-watchers
├── API Deployment
│   ├── Replicas: 3
│   ├── CPU: 500m
│   └── Memory: 512Mi
├── Stellar Service Deployment
│   ├── Replicas: 2
│   ├── CPU: 250m
│   └── Memory: 256Mi
├── Web Deployment
│   ├── Replicas: 2
│   ├── CPU: 200m
│   └── Memory: 256Mi
├── Redis StatefulSet
│   ├── Replicas: 1
│   └── Memory: 1Gi
├── MongoDB StatefulSet
│   ├── Replicas: 3 (replica set)
│   └── Memory: 2Gi each
└── RabbitMQ StatefulSet
    ├── Replicas: 1
    └── Memory: 512Mi
```

The diagram below shows the same topology end-to-end across environments — local
`docker-compose.dev.yml`, containerized `docker-compose.yml`, the Kubernetes `health-watchers`
namespace, and the managed cloud services each promotes to:

```mermaid
%% Deployment topology across environments
%% Ground truth: docker-compose.dev.yml, docker-compose.yml, k8s/, helm/health-watchers
flowchart TB
    subgraph Local["Local Development — docker-compose.dev.yml"]
        DEV_APPS["api / web / stellar-service<br/>(npm run dev, on host)"]
        DEV_MONGO[("mongo")]
        DEV_JAEGER["jaeger"]
        DEV_MEXP["mongo-express"]
    end

    subgraph Compose["Docker Compose — docker-compose.yml"]
        C_API["api"]
        C_WEB["web"]
        C_STELLAR["stellar-service"]
        C_MONGO[("mongodb")]
        C_JAEGER["jaeger"]
        C_PROM["prometheus"]
        C_GRAFANA["grafana"]
    end

    subgraph K8s["Kubernetes — namespace: health-watchers"]
        API_K8S["api<br/>Deployment + HPA + PDB"]
        WEB_K8S["web<br/>Deployment + HPA + PDB"]
        STELLAR_K8S["stellar-service<br/>Deployment + HPA + PDB"]
        REDIS_K8S["redis<br/>Deployment (Helm)"]
        INGRESS["Ingress"]
    end

    subgraph Cloud["Cloud / External Services"]
        MONGO_ATLAS[("MongoDB Atlas /<br/>managed replica set")]
        STELLAR_NET(("Stellar Network"))
        SECRETS["AWS Secrets Manager"]
        S3["S3 Backups"]
    end

    DEV_APPS --> DEV_MONGO
    DEV_APPS --> DEV_JAEGER
    DEV_MEXP --> DEV_MONGO

    C_API --> C_MONGO
    C_WEB --> C_API
    C_STELLAR --> C_JAEGER
    C_API --> C_JAEGER
    C_PROM --> C_API
    C_GRAFANA --> C_PROM

    Local -.->|"containerized equivalent"| Compose
    Compose -.->|"promoted via CI/CD"| K8s

    INGRESS --> API_K8S
    INGRESS --> WEB_K8S
    API_K8S --> REDIS_K8S
    API_K8S --> STELLAR_K8S
    API_K8S --> MONGO_ATLAS
    STELLAR_K8S --> STELLAR_NET

    K8s -.-> SECRETS
    K8s -.-> S3
```

Source: [`docs/diagrams/deployment-architecture.mmd`](diagrams/deployment-architecture.mmd)

### Blue-Green Deployment Strategy

```
Traffic
  │
  ├─→ Blue Environment (Active)
  │   ├── API v2.0
  │   ├── Database: Current schema
  │   └── Connection: 100%
  │
  └─→ Green Environment (Standby)
      ├── API v2.1 (new)
      ├── Database: Migrated schema
      └── Connection: 0%
      
After validation:
Traffic switches to Green
Blue becomes Standby
```

Both slots run full replica counts at all times so traffic only switches once
the new slot reports healthy, giving zero-downtime cutover and an instant
rollback path. See [docs/BLUE_GREEN_DEPLOYMENT.md](BLUE_GREEN_DEPLOYMENT.md)
for the full runbook and `k8s/api/blue-green/` for the manifests.

## Integration Points

### External Services
- **Google Gemini API**: AI-powered insights
- **AWS Secrets Manager**: Credential management
- **SendGrid**: Email delivery
- **Sentry**: Error tracking
- **SonarCloud**: Code quality

### Third-party Integrations
- Stellar DEX for token exchange
- Payment gateways for settlements
- EHR systems via HL7 FHIR

## Disaster Recovery

**RPO (Recovery Point Objective)**: 5 minutes
**RTO (Recovery Time Objective)**: 15 minutes

```
Backup Strategy:
├── Daily incremental backups → S3
├── Weekly full backups → S3 Glacier
└── Point-in-time recovery: 30 days

Replication:
├── MongoDB replica set: 3 nodes
├── Cross-region backup: AWS Backup Vault
└── Failover: Automatic election
```

## Monitoring & Observability

**Prometheus Metrics**
```
- API response time (p50, p95, p99)
- Error rates by endpoint
- Transaction success rate
- Certificate expiry countdown
- Database replication lag
```

**Alerts**
```
- API error rate > 1%
- Response time > 2s
- Certificate expires in < 7 days
- MongoDB connection pool exhaustion
- Stellar network unavailable
```

**Logging**
```
- Structured JSON logs (Winston)
- Elasticsearch aggregation
- Kibana dashboards
- Log retention: 30 days
```

## Security Considerations

1. **Network Security**
   - Network policies (Kubernetes)
   - Ingress/egress controls
   - API rate limiting

2. **Data Security**
   - Encryption at rest (AES-256)
   - Encryption in transit (TLS 1.3)
   - Field-level PII encryption

3. **Access Control**
   - RBAC with least privilege
   - Audit logging of all mutations
   - MFA for sensitive operations

4. **Compliance**
   - HIPAA audit trails
   - Data retention policies
   - Consent management

## Performance Characteristics

| Metric | Target | Current |
|--------|--------|---------|
| API P99 Latency | < 500ms | 340ms |
| Throughput | 10K req/sec | 8.5K req/sec |
| Database Query P95 | < 100ms | 75ms |
| Cache Hit Rate | > 80% | 85% |

## Future Architecture Improvements

1. **Event Sourcing**: Complete audit trail
2. **CQRS**: Separate read/write models
3. **Service Mesh**: Istio for advanced routing
4. **Multi-region**: Active-active deployments
5. **Graphql**: Flexible query API
