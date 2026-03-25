# Deployment Guide

This guide covers everything a DevOps engineer needs to deploy Health Watchers to production from scratch.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Database Setup](#3-database-setup)
4. [Build Steps](#4-build-steps)
5. [Docker Deployment](#5-docker-deployment)
6. [Reverse Proxy — Nginx](#6-reverse-proxy--nginx)
7. [SSL / TLS](#7-ssl--tls)
8. [Health Checks](#8-health-checks)
9. [Monitoring](#9-monitoring)
10. [Rollback Procedure](#10-rollback-procedure)
11. [Backup & Restore](#11-backup--restore)

---

## 1. Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Docker | 24.x | `docker --version` |
| Docker Compose | 2.x | `docker compose version` |
| Node.js | 18.x LTS | Only needed for local builds |
| npm | 10.x | Bundled with Node 18 |
| Nginx | 1.24+ | Reverse proxy / SSL termination |
| MongoDB | 7.0 | Or MongoDB Atlas / AWS DocumentDB |
| Certbot | Latest | For Let's Encrypt SSL certificates |

**Server minimum specs (production):**
- 2 vCPU, 4 GB RAM, 20 GB SSD
- Ubuntu 22.04 LTS or Debian 12 recommended
- Ports 80 and 443 open inbound

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in all values. **Never commit `.env` to git.**

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` |
| `API_PORT` | Express API port | `3001` |
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster/db?ssl=true` |
| `JWT_ACCESS_TOKEN_SECRET` | Signs access tokens (15 min TTL) — min 64 bytes | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_TOKEN_SECRET` | Signs refresh tokens (7 day TTL) — min 64 bytes, different from access secret | same generation command |
| `STELLAR_NETWORK` | Blockchain network | `mainnet` (production) or `testnet` |
| `STELLAR_SECRET_KEY` | Stellar private key for signing transactions | `S...` (Ed25519) |
| `STELLAR_PLATFORM_PUBLIC_KEY` | Platform's Stellar public key for receiving payments | `G...` |
| `GEMINI_API_KEY` | Google Gemini API key for AI features | `AIza...` |
| `NEXT_PUBLIC_API_URL` | API base URL accessible from the browser | `https://api.yourdomain.com` |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry | `1` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STELLAR_SERVICE_PORT` | Stellar service port | `3002` |
| `LOG_LEVEL` | Logging verbosity (`error`/`warn`/`info`/`debug`) | `info` |
| `SENTRY_DSN` | Sentry error tracking DSN | _(disabled)_ |
| `DOCS_USER` | Basic auth username for `/api/docs` | `admin` |
| `DOCS_PASS` | Basic auth password for `/api/docs` | `admin` |
| `AWS_REGION` | AWS region for Secrets Manager | `us-east-1` |
| `ENABLE_SECRETS_MANAGER` | Pull secrets from AWS Secrets Manager | `false` |

> **Security:** In production, manage secrets via AWS Secrets Manager or HashiCorp Vault. See [SECURITY.md](./SECURITY.md).

---

## 3. Database Setup

### Option A — Docker (included in `docker-compose.yml`)

MongoDB is included in the Compose stack. For production, use a managed service instead.

### Option B — MongoDB Atlas (recommended for production)

1. Create a cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user with `readWrite` on the `health_watchers` database
3. Whitelist your server's IP address
4. Copy the connection string into `MONGO_URI`:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/health_watchers?retryWrites=true&w=majority
```

### Option C — Self-hosted MongoDB

```bash
# Install MongoDB 7.0 on Ubuntu
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

Create the application user:

```js
// mongosh
use health_watchers
db.createUser({
  user: "hw_app",
  pwd: "<strong-password>",
  roles: [{ role: "readWrite", db: "health_watchers" }]
})
```

Enable authentication in `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

---

## 4. Build Steps

### Local / CI build

```bash
# Install dependencies
npm install

# Build all packages (api, web, stellar-service)
npm run build
```

Build output:
- `apps/api/dist/` — compiled Express API
- `apps/web/.next/` — compiled Next.js app
- `apps/stellar-service/dist/` — compiled Stellar service

### Docker image build

```bash
# Build all images
docker compose build

# Or build a specific service
docker compose build api
docker compose build web
docker compose build stellar-service
```

---

## 5. Docker Deployment

### First-time deployment

```bash
# 1. Clone the repository
git clone https://github.com/your-org/health_watchers.git
cd health_watchers

# 2. Configure environment
cp .env.example .env
# Edit .env with production values
nano .env

# 3. Start all services
docker compose up -d

# 4. Verify all containers are running
docker compose ps
```

### Expected running containers

| Container | Port | Purpose |
|-----------|------|---------|
| `health-watchers-mongodb` | 27017 (internal) | Database |
| `health-watchers-api` | 3001 | Express REST API |
| `health-watchers-stellar-service` | 3002 | Stellar blockchain service |
| `health-watchers-web` | 3000 | Next.js frontend |

### Updating to a new version

```bash
git pull origin main
docker compose build
docker compose up -d --no-deps --build api web stellar-service
```

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
```

---

## 6. Reverse Proxy — Nginx

Install Nginx:

```bash
sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/health-watchers`:

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (managed by Certbot — see Section 7)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Next.js frontend
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Express API
    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Rate limiting for API endpoints
        limit_req zone=api burst=20 nodelay;
    }

    # Health check endpoint (no auth required)
    location = /health {
        proxy_pass http://127.0.0.1:3001/health;
        access_log off;
    }

    # Block access to sensitive paths
    location ~ /\. {
        deny all;
    }
}
```

Add rate limiting to `/etc/nginx/nginx.conf` inside the `http {}` block:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/health-watchers /etc/nginx/sites-enabled/
sudo nginx -t          # validate config
sudo systemctl reload nginx
```

---

## 7. SSL / TLS

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically; verify with:
sudo certbot renew --dry-run
```

Certbot adds a cron job at `/etc/cron.d/certbot` that renews certificates automatically before expiry.

---

## 8. Health Checks

Each service exposes a health endpoint:

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| API | `GET /health` | `{"status":"ok","service":"health-watchers-api"}` |
| Stellar Service | `GET /health` | `{"status":"ok","service":"health-watchers-stellar-service"}` |
| Web | `GET /` | HTTP 200 |

### Manual check

```bash
curl -sf http://localhost:3001/health && echo "API OK"
curl -sf http://localhost:3002/health && echo "Stellar OK"
curl -sf http://localhost:3000 && echo "Web OK"
```

### Docker health status

```bash
docker compose ps   # shows health: healthy / unhealthy / starting
```

---

## 9. Monitoring

### Application logs

```bash
# Stream all logs
docker compose logs -f

# Last 100 lines from API
docker compose logs --tail=100 api
```

For persistent log aggregation, forward Docker logs to a log management service:

```bash
# Example: ship to a syslog endpoint
docker compose logs -f | logger -t health-watchers
```

### Recommended monitoring stack

| Tool | Purpose | Setup |
|------|---------|-------|
| **UptimeRobot** (free) | Uptime monitoring + alerts | Add `https://yourdomain.com/health` as HTTP monitor |
| **Sentry** | Error tracking | Set `SENTRY_DSN` env var |
| **MongoDB Atlas** | Database metrics | Built-in Atlas monitoring dashboard |
| **Grafana + Prometheus** | Full metrics stack | Optional — add `prom-client` to API |

### Disk space alert

```bash
# Add to crontab — alert if disk > 80%
*/30 * * * * df -h / | awk 'NR==2 {if ($5+0 > 80) print "DISK WARNING: "$5" used"}' | mail -s "Disk Alert" ops@yourdomain.com
```

---

## 10. Rollback Procedure

### Docker rollback (recommended)

Tag images before each deployment:

```bash
# Before deploying new version, tag current images
docker tag health-watchers-api:latest health-watchers-api:rollback
docker tag health-watchers-web:latest health-watchers-web:rollback
docker tag health-watchers-stellar-service:latest health-watchers-stellar-service:rollback
```

To roll back:

```bash
# 1. Stop current containers
docker compose down

# 2. Restore rollback images
docker tag health-watchers-api:rollback health-watchers-api:latest
docker tag health-watchers-web:rollback health-watchers-web:latest
docker tag health-watchers-stellar-service:rollback health-watchers-stellar-service:latest

# 3. Restart
docker compose up -d

# 4. Verify health
curl -sf http://localhost:3001/health && echo "API OK"
```

### Git rollback

```bash
# Find the last known-good commit
git log --oneline -10

# Roll back to that commit
git checkout <commit-hash>
docker compose build
docker compose up -d
```

### Database rollback

If a deployment included a breaking schema change, restore from the most recent backup:

```bash
# List available backups
ls /var/backups/health-watchers/

# Restore (see Section 11 for full procedure)
mongorestore --uri="$MONGO_URI" --gzip --drop /tmp/hw-restore/dump-YYYY-MM-DD
```

> **Important:** Always take a fresh backup immediately before deploying a new version.

---

## 11. Backup & Restore

### Manual backup

```bash
MONGO_URI="mongodb://..." ./scripts/backup.sh
```

### Automated daily backup (cron)

```bash
crontab -e
# Add:
0 2 * * * MONGO_URI="mongodb://..." BACKUP_DIR="/var/backups/health-watchers" /path/to/scripts/backup.sh >> /var/log/hw-backup.log 2>&1
```

Backups are retained for 30 days and stored as compressed `.tar.gz` archives.

### Restore

```bash
# 1. Extract archive
tar -xzf /var/backups/health-watchers/backup-YYYY-MM-DD.tar.gz -C /tmp/hw-restore

# 2. Restore (--drop replaces existing data)
mongorestore --uri="$MONGO_URI" --gzip --drop /tmp/hw-restore/dump-YYYY-MM-DD

# 3. Verify
mongosh "$MONGO_URI" --eval "db.stats()"

# 4. Clean up
rm -rf /tmp/hw-restore
```

---

## Quick Reference

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f [service]

# Rebuild and redeploy a service
docker compose up -d --no-deps --build <service>

# Check health
curl http://localhost:3001/health
curl http://localhost:3002/health

# Run backup
./scripts/backup.sh

# Validate Nginx config
sudo nginx -t && sudo systemctl reload nginx
```
