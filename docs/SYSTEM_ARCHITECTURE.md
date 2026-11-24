# Health Watchers System Architecture

Interactive overview of how all components communicate in the Health Watchers platform.

**Last updated**: 2026-10-17

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USERS & CLIENTS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  📱 Mobile App          🌐 Web Browser          🏥 Clinic Staff            │
│  (React Native)         (Next.js SPA)           (Admin Dashboard)          │
│                                                                               │
└────┬────────────────────────────────┬────────────────────────────────┬──────┘
     │                                │                                │
     │ HTTPS                          │ HTTPS/WebSocket               │
     │                                │                                │
     └────────────────────┬───────────┴────────────┬────────────────┘
                          │                        │
                    ┌─────▼────────────┐    ┌─────▼──────────┐
                    │  apps/web        │    │   apps/api     │
                    │  Next.js 15      │    │  Express 4.x   │
                    │  React 19        │    │  Node.js 22    │
                    ├──────────────────┤    ├────────────────┤
                    │ - Pages/Routes   │    │ - REST API     │
                    │ - Components     │    │ - WebSockets   │
                    │ - Forms          │    │ - Auth (JWT)   │
                    │ - State (Redux)  │    │ - Validation   │
                    │ - Type Safety    │    │ - Business     │
                    │   (TypeScript)   │    │   Logic        │
                    └─────┬────────────┘    └────────┬───────┘
                          │                         │
                          │ Realtime Updates        │
                          │ (Socket.IO)             │
                          │                         │
                    ┌─────▼─────────────────────────▼────────┐
                    │                                        │
                    │    🔐 Authentication Layer             │
                    │    - JWT tokens (Access/Refresh)       │
                    │    - RBAC (Role-Based Access Control)  │
                    │    - Session management                │
                    │    - Rate limiting & Brute-force       │
                    │                                        │
                    └────────────────┬─────────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │    Central Database Tier         │
                    ├─────────────────────────────────┤
                    │                                 │
                    │  📊 MongoDB                      │
                    │  ├─ Patients (PHI encrypted)    │
                    │  ├─ Encounters & Labs           │
                    │  ├─ Payments & Invoices         │
                    │  ├─ Audit Logs (immutable)      │
                    │  ├─ Consent Records             │
                    │  └─ User Profiles               │
                    │                                 │
                    │  🗂️  Redis (Cache/Queue)        │
                    │  ├─ Session cache (TTL: 7d)    │
                    │  ├─ Patient list cache (60s)   │
                    │  ├─ Rate limit buckets          │
                    │  └─ Job queue (BullMQ)          │
                    │                                 │
                    └────────────────┬────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
         ┌────▼────────┐        ┌────▼────────┐    ┌───────▼──────┐
         │              │        │              │    │              │
         │ 💰 Stellar   │        │ 📧 Email     │    │ 🔍 External  │
         │ Blockchain   │        │ Service      │    │ Services     │
         │ Microservice │        │              │    │              │
         ├──────────────┤        ├──────────────┤    ├──────────────┤
         │              │        │              │    │              │
         │ apps/        │        │ BullMQ       │    │ Gemini API   │
         │ stellar-     │        │ + Nodemailer │    │ (AI Analysis)│
         │ service      │        │              │    │              │
         │              │        │ Templates:   │    │ Twilio       │
         │ Port: 3002   │        │ - Signup     │    │ (SMS/Video)  │
         ├──────────────┤        │ - Password   │    │              │
         │              │        │   reset      │    │ AWS S3       │
         │ - Account    │        │ - Invite     │    │ (Photos/Docs)│
         │   queries    │        │ - Alerts     │    │              │
         │ - Payments   │        │              │    │ SendGrid     │
         │ - Transfers  │        │ Providers:   │    │ (Email)      │
         │ - Path       │        │ - SMTP       │    │              │
         │   finding    │        │ - Twilio     │    │ Firebase     │
         │ - Fee calc   │        │ - Firebase   │    │ (Push notif) │
         │ - Escrow     │        │              │    │              │
         │ - Multisig   │        └──────────────┘    └──────────────┘
         │              │
         │ XLM + USDC   │
         │ testnet/     │
         │ mainnet      │
         └──────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE & MONITORING                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  📊 Observability                                                            │
│  ├─ Prometheus (metrics scraping)                                           │
│  ├─ Grafana (dashboards)                                                   │
│  ├─ OpenTelemetry (distributed tracing)                                    │
│  ├─ Sentry (error tracking)                                                │
│  └─ Datadog (APM)                                                          │
│                                                                               │
│  🔐 Security                                                                 │
│  ├─ AWS Secrets Manager (key rotation)                                     │
│  ├─ Helmet.js (HTTP headers)                                               │
│  ├─ express-rate-limit (brute-force protection)                           │
│  ├─ Field-level encryption (AES-256)                                       │
│  └─ HIPAA audit logging (immutable)                                        │
│                                                                               │
│  🚀 Deployment                                                               │
│  ├─ Docker containers (apps/api, apps/stellar-service)                    │
│  ├─ Kubernetes orchestration                                               │
│  ├─ GitHub Actions (CI/CD)                                                │
│  ├─ Automated testing (unit/integration/E2E)                              │
│  └─ Blue-green deployment                                                 │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Examples

### Example 1: Patient Login & Data Access

```
1. User (web/mobile)
   └─> POST /api/v1/auth/login {email, password}
       ├─> apps/api (Express)
       │   ├─> Validate credentials (bcryptjs)
       │   ├─> Check brute-force (Redis rate limiting)
       │   ├─> Log access (audit.model.ts)
       │   └─> Generate JWT tokens (access + refresh)
       └─> Return tokens + user profile
           ├─> Access token (15 min expiry)
           ├─> Refresh token (7 day expiry)
           └─> WebSocket upgrade (Socket.IO)

2. User requests patient data
   └─> GET /api/v1/patients?page=1&limit=20
       ├─> Verify JWT token middleware
       ├─> Check Redis cache (patients:clinic_123:page=1)
       │   ├─> Cache hit → Return cached data
       │   ├─> Cache miss →
       │   │   ├─> Query MongoDB
       │   │   ├─> Decrypt PHI fields (FIELD_ENCRYPTION_KEY)
       │   │   ├─> Store in Redis (60s TTL)
       │   │   └─> Log access (PATIENT_VIEW audit event)
       └─> Return paginated patient list
```

### Example 2: Payment Processing

```
1. Doctor initiates payment
   └─> POST /api/v1/payments/intent
       ├─> apps/api (Express)
       │   ├─> Validate request (Zod schema)
       │   ├─> Check fee budget (feeBudgetCheck middleware)
       │   ├─> Create payment intent (record in MongoDB)
       │   ├─> Generate unique memo
       │   └─> Return payment details
       └─> Doctor shares with patient (QR code / payment URI)

2. Patient submits payment on blockchain
   └─> apps/stellar-service (microservice)
       ├─> Receive webhook from Stellar Horizon
       ├─> Verify transaction signature
       ├─> Check payment matches intent
       ├─> Update payment record (MongoDB)
       ├─> Emit PaymentConfirmed event
       └─> POST /api/v1/webhooks/stellar (callback)
           ├─> apps/api receives confirmation
           ├─> Update payment status
           ├─> Clear Redis cache (dashboard invalidation)
           ├─> Log payment event (PAYMENT_CREATE audit)
           ├─> Queue confirmation email (BullMQ)
           └─> Notify via WebSocket (real-time update)

3. Background job processes email
   └─> BullMQ worker
       ├─> Get email template
       ├─> Render with payment data
       ├─> Send via nodemailer (SMTP/Twilio/Firebase)
       └─> Log send status
```

### Example 3: Batch Export (HIPAA)

```
1. Admin requests patient export
   └─> POST /api/v1/exports
       ├─> Verify admin role (RBAC)
       ├─> Create export job (queued in BullMQ)
       ├─> Log export initiation (action: DATA_EXPORT_REQUEST)
       └─> Return job ID

2. Background worker processes
   └─> BullMQ worker (separate pod)
       ├─> Query patients from MongoDB
       ├─> Decrypt PHI fields (FIELD_ENCRYPTION_KEY)
       ├─> Format as CSV/FHIR/HL7
       ├─> Encrypt export (DOCUMENT_ENCRYPTION_KEY)
       ├─> Upload to S3 (signed URL)
       ├─> Log completion (DATA_EXPORT_FULFILLED)
       └─> Send download link via email

3. Admin downloads
   └─> GET /api/v1/exports/:exportId/download
       ├─> Verify user owns export
       ├─> Generate S3 presigned URL
       ├─> Log download (EXPORT_PATIENT_DATA)
       └─> Redirect to S3
```

---

## Component Communication Matrix

| From | To | Method | Protocol | Security |
|------|-------|--------|----------|----------|
| Web/Mobile | API | HTTP/REST | HTTPS | JWT + RBAC |
| API | Stellar Service | HTTP/Webhooks | HTTPS | Shared secret |
| API | MongoDB | Network socket | TLS | Encryption at rest |
| API | Redis | Network socket | TLS | Password auth |
| API | Email Service | SMTP/API | TLS/HTTPS | API keys |
| Stellar Service | Stellar Network | HTTPS | TLS | Mainnet safety gate |
| BullMQ | Redis | Network socket | TLS | Password auth |
| Webhook | API | HTTP POST | HTTPS | Signature verification |
| Frontend | Socket.IO | WebSocket | WSS | JWT auth |

---

## Deployment Topology

### Development Environment
```
Local machine:
├─ apps/api (npm run dev:api) → localhost:3001
├─ apps/web (npm run dev:web) → localhost:3000
├─ apps/stellar-service (npm run dev:stellar) → localhost:3002
├─ MongoDB (local) → mongodb://localhost:27017
└─ Redis (local) → redis://localhost:6379
```

### Production Environment
```
AWS/Kubernetes:
├─ apps/api replicas (auto-scaling)
│  ├─ Pod 1-N (load balanced)
│  └─ EBS volumes for logs
├─ apps/stellar-service replicas
│  └─ Pod 1-N (dedicated for Stellar operations)
├─ RDS MongoDB (managed)
├─ ElastiCache Redis (managed)
├─ ECS/ECR (container registry)
├─ CloudFront CDN
├─ S3 (uploads, exports, backups)
├─ Secrets Manager (key rotation)
└─ VPC with security groups
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js | 15.x |
| | React | 19.x |
| | TypeScript | 5.x |
| | Tailwind CSS | 3.x |
| | Redux | 5.x |
| **Backend API** | Express | 4.x |
| | Node.js | 22.x |
| | TypeScript | 5.x |
| | Mongoose | 8.x |
| **Stellar Service** | Soroban SDK | Latest |
| | Stellar SDK | 12.x+ |
| **Database** | MongoDB | 6.x+ |
| | Redis | 6.x+ |
| **Queue** | BullMQ | 6.x |
| **Email** | Nodemailer | 9.x |
| **Testing** | Jest | 29.x |
| | Playwright | 4.x |
| | Pact | 14.x |
| **Monitoring** | Prometheus | Latest |
| | Grafana | Latest |
| | Sentry | 8.x+ |
| **Deployment** | Docker | Latest |
| | Kubernetes | 1.27+ |
| | GitHub Actions | Latest |

---

## Key Design Decisions

### 1. Microservice Architecture
- **API** handles business logic & HTTP requests
- **Stellar Service** handles blockchain interactions separately
- Allows independent scaling and deployment

### 2. Queue-Based Email
- Emails sent asynchronously via BullMQ
- Prevents blocking HTTP responses
- Retry logic for failed sends
- Can scale workers independently

### 3. Field-Level Encryption
- PHI encrypted at rest in MongoDB
- Decryption happens only in API layer
- Keys rotated annually
- Audit logs on every PHI access

### 4. Cache Strategy
- Redis for session data (7 day TTL)
- Patient list cached (60 second TTL)
- Dashboard data cached (1 minute TTL)
- Cache invalidated on data mutation

### 5. Real-Time Updates
- Socket.IO for live notifications
- Payment status updates pushed immediately
- Dashboard metrics refresh in real-time
- Fallback to polling for unavailable clients

---

## How to Add a New Feature

1. **Frontend** (apps/web): Add React component
2. **API Route** (apps/api): Add Express endpoint
3. **Database** (MongoDB): Add/update schema if needed
4. **Audit Logging** (apps/api): Log all PHI access
5. **Email** (if applicable): Add template & queue job
6. **Testing**: Add unit/integration/E2E tests
7. **Documentation**: Update this diagram & relevant docs

---

## Troubleshooting Guide

**"API timeout when querying patients"**
- Check Redis connection (might be full)
- Check MongoDB performance (check indexes)
- Check network latency (monitoring → Grafana)

**"Payments failing silently"**
- Check stellar-service logs (did Horizon call succeed?)
- Check webhook delivery (verify signature)
- Check Redis queue (BullMQ job stuck?)

**"High memory in API pods"**
- Check for unclosed database connections
- Check Redis client pool size
- Check for memory leaks (heap snapshot)

**"Email not sending"**
- Check SMTP credentials (AWS Secrets Manager)
- Check BullMQ worker logs
- Check mail provider (SendGrid/Twilio status)

---

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Deep dive into design patterns
- **[CI_CD_PIPELINE.md](./CI_CD_PIPELINE.md)** — Deployment process
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** — How to write tests
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — Code contribution guidelines
