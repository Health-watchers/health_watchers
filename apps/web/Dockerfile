# Development Dockerfile for Web
FROM node:18-alpine

# Create a non-root user to run the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only package files first (not entire source)
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy only the necessary source directories explicitly
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY apps/web/next.config.* ./apps/web/
COPY apps/web/tsconfig*.json ./apps/web/
COPY apps/web/tailwind.config.* ./apps/web/
COPY apps/web/postcss.config.* ./apps/web/
COPY tsconfig.base.json ./
COPY turbo.json ./

# Switch to non-root user
USER appuser

# Expose web port
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start development server
CMD ["npm", "run", "dev", "--workspace=web"]