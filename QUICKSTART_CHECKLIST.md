# Quick Start Checklist

Use this checklist to get Health Watchers running in under 5 minutes.

## Prerequisites Check
- [ ] Docker installed and running
- [ ] Docker Compose installed
- [ ] Git installed

## Setup Steps

### 1. Clone and Configure (1 minute)
```bash
git clone https://github.com/OWNER/health-watchers.git
cd health-watchers
cp .env.example .env
```

### 2. Start Services (30 seconds)
```bash
docker-compose up -d
```

### 3. Wait for Services (1-2 minutes)
```bash
# Watch logs until services are ready
docker-compose logs -f
```

Look for these messages:
- MongoDB: "Waiting for connections"
- API: "Server listening on port 3001"
- Web: "Ready on http://localhost:3000"

### 4. Access Application (immediate)
- Web UI: http://localhost:3000
- API: http://localhost:3001
- MongoDB: localhost:27017

### 5. Verify Everything Works
```bash
# Check all services are running
docker-compose ps

# Should show 4 services: mongodb, api, web, stellar-service
```

## Troubleshooting

### Services won't start?
```bash
docker-compose down
docker-compose up -d
```

### Port conflicts?
Edit `docker-compose.yml` and change port mappings.

### Need to reset?
```bash
docker-compose down -v  # Removes volumes
docker-compose up -d
```

## Next Steps

- [ ] Read the full [README.md](README.md)
- [ ] Configure environment variables in `.env`
- [ ] Set up GitHub badges (see `.github/BADGE_SETUP.md`)
- [ ] Run the seed script: `npm run seed`
- [ ] Explore the API documentation

## Total Time: ~5 minutes ✅
