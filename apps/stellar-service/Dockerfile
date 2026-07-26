# Development Dockerfile for Stellar Service
FROM node:18-alpine

# Create a non-root user to run the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only package files first (not entire source)
COPY package*.json ./
COPY apps/stellar-service/package*.json ./apps/stellar-service/

# Install dependencies
RUN npm ci

# Copy only the necessary source directories explicitly
COPY apps/stellar-service/src ./apps/stellar-service/src
COPY apps/stellar-service/tsconfig*.json ./apps/stellar-service/
COPY tsconfig.base.json ./
COPY turbo.json ./

# Switch to non-root user
USER appuser

# Expose stellar service port
EXPOSE 3002

# Set stop signal for graceful shutdown
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start development server
CMD ["npm", "run", "dev", "--workspace=stellar-service"]
