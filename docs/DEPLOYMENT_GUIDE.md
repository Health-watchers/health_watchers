# Deployment Guide

This guide covers deploying Health Watchers to production environments using Docker, Docker Compose, and Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Deployment](#docker-deployment)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Blue-Green Deployment](BLUE_GREEN_DEPLOYMENT.md)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)
- [Runbooks](#runbooks)
- [Performance Tuning](#performance-tuning)

## Prerequisites

### Required Tools

| Tool | Minimum Version | Install |
|------|----------------|---------|
| Docker | 24.x | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Docker Compose | 2.x | Bundled with Docker Desktop |
| Node.js | 18.0.0 | [nodejs.org](https://nodejs.org/) |
| npm | 10.9.2 | Bundled with Node.js |
| Git | 2.x | [git-scm.com](https://git-scm.com/) |

### For Kubernetes Deployments

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| kubectl | 1.28+ | Cluster management |
| Helm | 3.x | Chart-based deployments |
| AWS CLI | 2.x | ECR image push, Secrets Manager |

### Infrastructure Requirements

| Component | Minimum (staging) | Recommended (prod) |
|-----------|------------------|-------------------|
| API server | 512 MB RAM, 0.5 vCPU | 1 GB RAM, 1 vCPU |
| Web server | 512 MB RAM, 0.5 vCPU | 1 GB RAM, 1 vCPU |
| Stellar service | 256 MB RAM, 0.25 vCPU | 512 MB RAM, 0.5 vCPU |
| MongoDB | 1 GB RAM, 1 vCPU | 4 GB RAM, 2 vCPU (replica set) |

### Required Environment Variables

Copy `.env.example` and fill in all required values before deploying:

```bash
cp .env.example .env
```

Key variables to configure before first deploy:

```bash
# Database
MONGO_URI=mongodb://...

# JWT Secrets — generate with: openssl rand -hex 64
JWT_ACCESS_TOKEN_SECRET=<64-char hex>
JWT_REFRESH_TOKEN_SECRET=<64-char hex>

# CSRF — generate with: openssl rand -hex 32
CSRF_SECRET=<32-char hex>

# Stellar
STELLAR_NETWORK=testnet     # or: public (mainnet)
STELLAR_KEYPAIR=<encrypted keypair JSON>

# Frontend
NEXT_PUBLIC_API_URL=https://api.healthwatchers.com

# Optional but recommended
SENTRY_DSN=<your-sentry-dsn>
SENDGRID_API_KEY=<key>
AWS_REGION=us-east-1
```

> Generate strong secrets: `openssl rand -hex 64`

### Recommended

- Helm (for Kubernetes package management)
- AWS CLI
- Git

## Docker Deployment

### Building Docker Images

Build all application images:

```bash
# Build API image
docker build -t health-watchers-api:latest apps/api

# Build Web image
docker build -t health-watchers-web:latest apps/web

# Build Stellar Service image
docker build -t health-watchers-stellar:latest apps/stellar-service

# Or use the build script
./scripts/docker-build.sh
```

### Running Individual Containers

**API Server:**
```bash
docker run -d \
  --name health-watchers-api \
  -p 3001:3001 \
  -e MONGO_URI=mongodb://mongo:27017/health_watchers \
  -e JWT_ACCESS_TOKEN_SECRET=your_secret \
  -e NODE_ENV=production \
  health-watchers-api:latest
```

**Web Application:**
```bash
docker run -d \
  --name health-watchers-web \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:3001 \
  health-watchers-web:latest
```

**Stellar Service:**
```bash
docker run -d \
  --name health-watchers-stellar \
  -p 3002:3002 \
  -e STELLAR_NETWORK=testnet \
  -e STELLAR_KEYPAIR=your_keypair \
  health-watchers-stellar:latest
```

## Docker Compose Deployment

### Quick Start (Development)

```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop all services
docker-compose -f docker-compose.dev.yml down
```

### Production Deployment

```bash
# Copy environment file
cp .env.example .env.production
# Edit .env.production with production values

# Start with production compose file
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f api

# Stop services gracefully
docker-compose -f docker-compose.prod.yml down
```

### Production Environment Variables

Create `.env.production`:

```bash
# Node Environment
NODE_ENV=production

# Database
MONGO_URI=mongodb://mongo-0.mongo-service:27017,mongo-1.mongo-service:27017,mongo-2.mongo-service:27017/health_watchers?replicaSet=rs0
MONGO_POOL_SIZE=50
MONGO_CONNECT_TIMEOUT=10000

# JWT
JWT_ACCESS_TOKEN_SECRET=<generate-strong-secret>
JWT_REFRESH_TOKEN_SECRET=<generate-strong-secret>
JWT_ACCESS_TOKEN_EXPIRY=3600
JWT_REFRESH_TOKEN_EXPIRY=604800

# API
API_PORT=3001
API_HOST=0.0.0.0
NEXT_PUBLIC_API_URL=https://api.healthwatchers.com

# Frontend
NEXT_PUBLIC_BASE_URL=https://healthwatchers.com

# Stellar
STELLAR_NETWORK=public
STELLAR_KEYPAIR=<encrypted-keypair>

# Security
CSRF_SECRET=<generate-strong-secret>
SESSION_SECRET=<generate-strong-secret>

# External Services
SENDGRID_API_KEY=<key>
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>

# Monitoring
SENTRY_DSN=<your-sentry-dsn>
LOG_LEVEL=info
```

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (EKS, AKS, GKE, or self-hosted)
- kubectl configured
- Helm installed (optional but recommended)

### Using Helm

The easiest way to deploy to Kubernetes:

```bash
# Add Helm repository (if using a chart repo)
helm repo add health-watchers https://charts.healthwatchers.com
helm repo update

# Install release
helm install hw-production health-watchers/health-watchers \
  --namespace production \
  --create-namespace \
  -f helm/values-production.yaml

# Upgrade release
helm upgrade hw-production health-watchers/health-watchers \
  -f helm/values-production.yaml

# Uninstall
helm uninstall hw-production -n production
```

### Using kubectl (Manual)

```bash
# Create namespace
kubectl create namespace production

# Create secrets
kubectl create secret generic hw-secrets \
  -n production \
  --from-literal=MONGO_URI=$MONGO_URI \
  --from-literal=JWT_ACCESS_TOKEN_SECRET=$JWT_SECRET

# Deploy MongoDB (optional)
kubectl apply -f k8s/mongodb-replica-set-statefulset.yaml -n production

# Deploy API
kubectl apply -f k8s/api/deployment.yaml -n production
kubectl apply -f k8s/api/service.yaml -n production

# Deploy Web
kubectl apply -f k8s/web/deployment.yaml -n production
kubectl apply -f k8s/web/service.yaml -n production

# Deploy Stellar Service
kubectl apply -f k8s/stellar-service/deployment.yaml -n production
kubectl apply -f k8s/stellar-service/service.yaml -n production

# Setup Ingress
kubectl apply -f k8s/ingress.yaml -n production
```

### Verify Deployment

```bash
# Check pods
kubectl get pods -n production

# Check services
kubectl get svc -n production

# Check logs
kubectl logs -n production deployment/api -f

# Port forward for testing
kubectl port-forward -n production svc/api 3001:3001
```

### Scaling

```bash
# Scale API deployment
kubectl scale deployment api -n production --replicas=3

# Autoscaling
kubectl apply -f k8s/api/hpa.yaml -n production
```

## Health Checks

### API Health Endpoint

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-27T10:00:00Z",
  "uptime": 3600,
  "database": "connected",
  "memory": {
    "heapUsed": 102400000,
    "heapTotal": 512000000
  }
}
```

### Kubernetes Liveness Probe

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Readiness Probe

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Troubleshooting

### Issue: MongoDB Connection Failed

**Symptoms:** API crashes with `MongoServerError: connect ECONNREFUSED`

**Solutions:**
```bash
# Check MongoDB is running
docker-compose -f docker-compose.prod.yml ps mongo

# Check logs
docker-compose -f docker-compose.prod.yml logs mongo

# Verify connection string in .env
echo $MONGO_URI

# Restart MongoDB
docker-compose -f docker-compose.prod.yml restart mongo
```

### Issue: High Memory Usage

**Symptoms:** OOMKilled pods, slow responses

**Solutions:**
```bash
# Check memory usage
docker stats

# Increase container memory limit
# In docker-compose.yml:
services:
  api:
    mem_limit: 1G
    mem_reservation: 512m

# For Kubernetes, update resource requests/limits
kubectl set resources deployment api \
  -n production \
  --limits=memory=1Gi,cpu=500m \
  --requests=memory=512Mi,cpu=250m
```

### Issue: Deployment Fails to Start

**Symptoms:** ImagePullBackOff or CrashLoopBackOff errors

**Solutions:**
```bash
# Check pod events
kubectl describe pod <pod-name> -n production

# Check logs
kubectl logs <pod-name> -n production

# Check image availability
docker images | grep health-watchers

# Push to registry if needed
docker tag health-watchers-api:latest myregistry/health-watchers-api:v1.0.0
docker push myregistry/health-watchers-api:v1.0.0
```

### Issue: Database Migrations Fail

**Symptoms:** API won't start, migration error in logs

**Solutions:**
```bash
# Check migration status
npm run migrate:status --workspace=api

# Rollback last migration
npm run migrate:down --workspace=api

# Run specific migration
npm run migrate:up --workspace=api

# For Kubernetes, run migration as init container
# In k8s/api/deployment.yaml:
initContainers:
  - name: migrate
    image: health-watchers-api:latest
    command: ["npm", "run", "migrate:up", "--workspace=api"]
```

## Runbooks

Detailed operational runbooks are in [`monitoring/runbooks/`](../monitoring/runbooks/). Use these when alerts fire or incidents occur.

### Runbook Index

| Alert / Scenario | Runbook | Severity |
|------------------|---------|----------|
| API completely down | [API_DOWN.md](../monitoring/runbooks/API_DOWN.md) | Critical |
| High error rate (>5%) | [HIGH_ERROR_RATE.md](../monitoring/runbooks/HIGH_ERROR_RATE.md) | High |
| High API latency (>2s p95) | [HIGH_LATENCY.md](../monitoring/runbooks/HIGH_LATENCY.md) | High |
| MongoDB primary down | [MONGODB_PRIMARY_DOWN.md](../monitoring/runbooks/MONGODB_PRIMARY_DOWN.md) | Critical |
| MongoDB replication lag | [MONGODB_REPLICATION_LAG.md](../monitoring/runbooks/MONGODB_REPLICATION_LAG.md) | High |
| MongoDB secondary falling behind | [MONGODB_SECONDARY_FALLING.md](../monitoring/runbooks/MONGODB_SECONDARY_FALLING.md) | Medium |
| MongoDB oplog full | [MONGODB_OPLOG_FULL.md](../monitoring/runbooks/MONGODB_OPLOG_FULL.md) | Critical |
| MongoDB connection pool exhausted | [MONGODB_POOL_WAIT_QUEUE.md](../monitoring/runbooks/MONGODB_POOL_WAIT_QUEUE.md) | High |
| Stellar keypair decryption failure | [STELLAR_KEYPAIR_DECRYPTION_FAILURE.md](../monitoring/runbooks/STELLAR_KEYPAIR_DECRYPTION_FAILURE.md) | Critical |
| Secrets management incident | [SECRETS_MANAGEMENT.md](../monitoring/runbooks/SECRETS_MANAGEMENT.md) | Critical |

### Daily Backup Runbook

**Schedule:** Runs automatically at 02:00 UTC daily via cron / GitHub Actions.

**Manual trigger:**
```bash
# From the host
./scripts/backup-mongodb.sh

# Or via Docker exec
docker exec health-watchers-api npm run backup
```

**What it does:**
1. Runs `mongodump` against the replica set
2. Compresses the output
3. Uploads to `s3://health-watchers-backups/mongo/YYYY-MM-DD/`
4. Verifies the upload with a checksum
5. Cleans up local files older than 7 days

**Verify a backup:**
```bash
./scripts/verify-backup.sh <backup-date>
# e.g. ./scripts/verify-backup.sh 2026-07-28
```

**Crontab (VM-based deployments):**
```crontab
0 2 * * * /home/ubuntu/health_watchers/scripts/backup-mongodb.sh >> /var/log/hw-backup.log 2>&1
```

See [`docs/BACKUP_VERIFICATION.md`](BACKUP_VERIFICATION.md) for the full backup and restore procedure.

### Zero-Downtime Deployment Runbook

**Docker Compose (staging):**
```bash
# Pull new images
docker-compose -f docker-compose.prod.yml pull

# Restart with zero-downtime (requires multiple replicas or external load balancer)
docker-compose -f docker-compose.prod.yml up -d --no-deps api
```

**Kubernetes — Rolling Update:**
```bash
# Update image tag
kubectl set image deployment/api \
  api=ghcr.io/health-watchers/api:v1.1.0 \
  -n production

# Watch rollout progress
kubectl rollout status deployment/api -n production --timeout=5m

# Rollback if unhealthy
kubectl rollout undo deployment/api -n production
```

**Blue-Green deployment** (recommended for major releases):

See [`docs/BLUE_GREEN_DEPLOYMENT.md`](BLUE_GREEN_DEPLOYMENT.md) and [`ops/blue-green-deployment.sh`](../ops/blue-green-deployment.sh).

### Database Migration Runbook

Migrations must run **before** the new API version starts. The CI/CD pipeline does this automatically. For manual deploys:

```bash
# 1. Check current migration status
npm run migrate:status --workspace=api

# 2. Apply pending migrations
npm run migrate:up --workspace=api

# 3. Verify
npm run migrate:status --workspace=api
```

**Rollback a failed migration:**
```bash
npm run migrate:down --workspace=api
# Fix the migration file
npm run migrate:up --workspace=api
```

**Kubernetes init container (automatic in k8s manifests):**
```yaml
initContainers:
  - name: migrate
    image: ghcr.io/health-watchers/api:latest
    command: ["npm", "run", "migrate:up", "--workspace=api"]
    envFrom:
      - secretRef:
          name: hw-secrets
```

### Monitoring Setup Runbook

**Start the monitoring stack:**
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

This starts Prometheus (`:9090`), Grafana (`:3003`), and Alertmanager (`:9093`).

**Apply Kubernetes monitoring resources:**
```bash
kubectl apply -f k8s/monitoring.yaml -n production
kubectl apply -f k8s/prometheus-rules.yaml -n production
```

**Default Grafana dashboards** (auto-provisioned):
- `monitoring/grafana/dashboards/health-watchers-overview.json` — Top-level KPIs
- `monitoring/grafana/dashboards/api-performance.json` — Latency, throughput, error rate
- `monitoring/grafana/dashboards/database-monitoring.json` — MongoDB replica set health

**ELK stack setup:**
```bash
./logging/setup-elk.sh
```

See [`logging/README.md`](../logging/README.md) for full ELK configuration.

### On-Call Escalation Runbook

1. **Alert fires** → On-call engineer acknowledges in PagerDuty / Alertmanager within **15 minutes**
2. **Initial triage** → Follow the relevant runbook in `monitoring/runbooks/`
3. **Escalate** if not resolved within 30 minutes:
   - Tier 1 → Tier 2 (senior engineer)
   - Data breach → Immediately escalate to Security + Legal + Executive
4. **Incident channel** → Open `#incidents` Slack channel, post status every 30 minutes
5. **Post-mortem** → Filed within 48 hours using the template in `docs/DISASTER_RECOVERY_PLAN.md`

**Contact escalation order:**

| Escalation | Contact |
|------------|---------|
| On-call engineer | PagerDuty rotation |
| Engineering lead | engineering-lead@healthwatchers.com |
| DevOps | devops@healthwatchers.com |
| Security (breach/compromise) | security@healthwatchers.com |
| Executive + Legal (HIPAA breach) | compliance@healthwatchers.com |

### Cleanup Runbook

Run periodically to reclaim disk space and remove stale resources:

```bash
# Remove failed/completed Kubernetes pods
kubectl delete pod --field-selector=status.phase=Failed -n production
kubectl delete pod --field-selector=status.phase=Succeeded -n production

# Remove old Docker images on build agents
docker image prune -a --filter "until=720h" -f

# Clean up completed Kubernetes jobs
kubectl delete job --field-selector=status.successful=1 -n production

# Rotate old log files (handled by logrotate)
logrotate -f /etc/logrotate.d/health-watchers
```

## Performance Tuning

### API Optimization

```bash
# Enable compression
NODE_ENV=production npm run start

# Adjust pool size
MONGO_POOL_SIZE=50

# Cache settings
REDIS_URL=redis://redis:6379
CACHE_TTL=3600
```

### Database Optimization

```bash
# Create indexes on production
npm run migrate:up --workspace=api

# Monitor index performance
db.patients.stats()

# Rebuild index if needed
db.patients.reIndex()
```

### Memory Management

```bash
# Set heap size
NODE_OPTIONS="--max_old_space_size=2048"

# Enable garbage collection logging
NODE_OPTIONS="--trace-gc"
```

## Support

- **Documentation:** Check `docs/` folder
- **Issues:** GitHub Issues
- **Email:** devops@healthwatchers.com
