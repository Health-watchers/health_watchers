# Development Dockerfile for Web
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Expose web port
EXPOSE 3000

# Start development server
CMD ["npm", "run", "dev", "--workspace=web"]
