# Development Dockerfile for API
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose API port
EXPOSE 3001

# Set stop signal for graceful shutdown
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health/live || exit 1

# Start development server
CMD ["npm", "run", "dev", "--workspace=api"]
