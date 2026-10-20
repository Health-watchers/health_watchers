#!/bin/bash
set -e

echo "🚀 Health Watchers Codespace Setup"
echo "===================================="

# Install dependencies
echo "📦 Installing npm dependencies..."
npm ci

# Copy environment template if .env doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env from template..."
  cp .env.example .env
  echo "⚠️  Remember to configure your .env file with proper secrets!"
fi

# Start Docker services in the background
echo "🐳 Starting Docker services (core profile)..."
docker compose --profile core up -d

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to be ready..."
timeout=60
elapsed=0
until docker compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1 || [ $elapsed -ge $timeout ]; do
  sleep 2
  elapsed=$((elapsed + 2))
  echo "  ... still waiting ($elapsed/$timeout seconds)"
done

if [ $elapsed -ge $timeout ]; then
  echo "⚠️  MongoDB did not start in time. You may need to start it manually."
else
  echo "✅ MongoDB is ready!"
fi

# Install git hooks
echo "🪝 Setting up git hooks..."
npm run prepare

echo ""
echo "✅ Setup complete!"
echo ""
echo "Quick Start Commands:"
echo "  npm run dev --workspace=api   # Start API in development mode"
echo "  npm run dev --workspace=web   # Start web app in development mode"
echo ""
echo "Useful URLs:"
echo "  Web UI:       http://localhost:3000"
echo "  API:          http://localhost:3001"
echo "  API Docs:     http://localhost:3001/api-docs"
echo "  Jaeger UI:    http://localhost:16686"
echo "  mongo-express: (run with --profile dev-tools)"
echo ""
echo "🎉 Happy coding!"
