FROM node:18-alpine AS builder

WORKDIR /app

# Copy monorepo configuration and package files
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Build Next.js application
WORKDIR /app/apps/web
RUN npm run build

# Production stage with standalone output
FROM node:18-alpine

WORKDIR /app

# Copy built application and public files
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public

# Set environment defaults
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
