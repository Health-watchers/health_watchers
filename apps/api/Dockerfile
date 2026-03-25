# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy monorepo configuration and package files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Build the API
WORKDIR /app/apps/api
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Copy only production dependencies and built code
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

# Set environment defaults
ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/app.js"]
