# Deployment Guide

This guide covers deploying Health Watchers to production environments using Docker, Docker Compose, and Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Deployment](#docker-deployment)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)
- [Runbooks](#runbooks)

## Prerequisites

### Required

- Docker & Docker Compose (for containerized deployment)
- kubectl (for Kubernetes)
- Node.js >= 18.0.0 (for manual deployment)
- MongoDB replica set (for production)
- AWS Account (for AWS resources)

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

### Daily Backup

```bash
#!/bin/bash
# scripts/backup-mongodb.sh

mongodump --uri="$MONGO_URI" \
  --out=/backups/mongo-$(date +%Y%m%d-%H%M%S)

# Upload to S3
aws s3 sync /backups s3://health-watchers-backups/mongo/
```

**Schedule with cron:**
```crontab
0 2 * * * /home/ubuntu/health_watchers/scripts/backup-mongodb.sh
```

### Monitoring Setup

**Prometheus:**
```bash
kubectl apply -f monitoring/prometheus.yml -n production
```

**Grafana:**
```bash
kubectl apply -f monitoring/grafana/ -n production
# Access: http://localhost:3000 (port-forward)
```

### Zero-Downtime Deployment

```bash
# Deploy with rolling update strategy
kubectl set image deployment/api api=health-watchers-api:v1.1.0 \
  -n production \
  --record

# Monitor rollout
kubectl rollout status deployment/api -n production

# Rollback if needed
kubectl rollout undo deployment/api -n production
```

### Cleanup Old Resources

```bash
# Remove old pods
kubectl delete pod --field-selector=status.phase=Failed -n production

# Remove old images
docker image prune -a -f

# Clean up completed jobs
kubectl delete job --field-selector=status.successful=1 -n production
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
