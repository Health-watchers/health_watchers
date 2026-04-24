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

# Start development server
CMD ["npm", "run", "dev", "--workspace=stellar-service"]
