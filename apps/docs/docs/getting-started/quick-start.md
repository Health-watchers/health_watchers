# Quick Start

Get Health Watchers running in 5 minutes.

## Prerequisites

- Node.js >= 18.0.0
- npm >= 10.9.2
- Docker and Docker Compose

## MongoDB Only (Recommended for Local Dev)

```bash
# 1. Clone the repository
git clone https://github.com/health-watchers/health-watchers.git
cd health-watchers

# 2. Copy environment configuration
cp .env.example .env

# 3. Start MongoDB
docker-compose -f docker-compose.dev.yml up -d

# 4. Install dependencies and start the API
npm install
npm run dev --workspace=api
```

The API will be available at `http://localhost:3001`.

## Full Stack with Docker Compose

```bash
# 1. Clone the repository
git clone https://github.com/health-watchers/health-watchers.git
cd health-watchers

# 2. Copy environment configuration
cp .env.example .env

# 3. Start all services
docker-compose up -d

# 4. Access the application
# Web UI: http://localhost:3000
# API: http://localhost:3001
```

## Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 3. Start MongoDB
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

## Next Steps

- [Installation Guide](./installation.md)
- [Configuration](./configuration.md)
- [Architecture Overview](../architecture/overview.md)
