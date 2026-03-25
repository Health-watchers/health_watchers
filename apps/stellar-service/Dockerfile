# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy monorepo configuration and package files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/stellar-service ./apps/stellar-service
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Build the stellar service
WORKDIR /app/apps/stellar-service
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Copy only production dependencies and built code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/stellar-service/dist ./dist
COPY --from=builder /app/apps/stellar-service/package.json ./

# Set environment defaults
ENV NODE_ENV=production
ENV STELLAR_NETWORK=testnet
ENV STELLAR_SERVICE_PORT=3002

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/index.js"]
