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

# Start development server
CMD ["npm", "run", "dev", "--workspace=api"]
