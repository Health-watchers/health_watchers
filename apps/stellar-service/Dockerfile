# Development Dockerfile for Stellar Service
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/stellar-service/package*.json ./apps/stellar-service/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose stellar service port
EXPOSE 3002

# Set stop signal for graceful shutdown
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start development server
CMD ["npm", "run", "dev", "--workspace=stellar-service"]
