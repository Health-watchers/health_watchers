# Docker Production Build Optimization

This document describes the Docker optimization strategies implemented for production builds in the Health Watchers project.

## Overview

The production Docker builds use multi-stage builds to minimize image size and improve security while maintaining fast build times through effective caching.

## Multi-Stage Build Strategy

### Stage 1: Builder
- Base image: `node:18-alpine`
- Installs all dependencies (including dev dependencies)
- Builds the application
- Prunes to production-only dependencies

### Stage 2: Production
- Base image: `node:18-alpine`
- Copies only the built artifacts and production dependencies
- Reduces final image size by 60-70% compared to including dev dependencies

## Image Optimization Techniques

### 1. Layer Caching
- Package files are copied first (most stable layer)
- Source code is copied after dependencies
- Build process follows dependency order to maximize cache hits
- Docker BuildKit is used for improved caching with `--progress=plain`

### 2. Image Size Minimization
- **Alpine Linux**: Reduces base image from ~900MB to ~150MB
- **No development dependencies**: Dev tools are excluded from final image
- **Optimized .dockerignore**: Excludes unnecessary files (test files, documentation, dev configs)
- **Production npm prune**: Removes dev dependencies before final stage

### 3. Security Best Practices
- **Non-root user**: Applications run as `appuser` with limited privileges
- **Proper file permissions**: `chown` ensures correct ownership
- **Metadata labels**: Images are tagged with maintainer and description
- **Minimal attack surface**: Only production dependencies included

### 4. Health Checks
- Integrated health checks in Docker images
- Validate service readiness with actual HTTP requests
- Docker Compose health dependencies ensure proper startup order

## Building Images

### Using docker-compose
```bash
docker-compose -f docker-compose.prod.yml build --no-cache
```

### Using build script with scanning
```bash
chmod +x scripts/docker-build.sh
./scripts/docker-build.sh
```

Environment variables for the build script:
- `REGISTRY`: Docker registry URL (default: docker.io)
- `NAMESPACE`: Registry namespace (default: healthwatchers)
- `VERSION`: Image version tag (default: latest)
- `ENABLE_SCAN`: Enable Trivy security scanning (default: true)
- `SCAN_SEVERITY`: Minimum severity to report (default: MEDIUM)

### Running with Docker BuildKit
Docker BuildKit provides improved caching and parallelization:
```bash
DOCKER_BUILDKIT=1 docker build -f apps/api/Dockerfile.prod .
```

## Image Security Scanning

The build script includes automated security scanning with [Trivy](https://github.com/aquasecurity/trivy).

### Scan Results
Scan results are saved to `/tmp/{service}-scan.txt` during builds.

### Severity Levels
- `CRITICAL`: Immediate action required
- `HIGH`: Should be addressed before production
- `MEDIUM`: Should be addressed in upcoming cycles
- `LOW`: Nice to fix

## Image Size Comparison

### API Service
- Development image: ~600MB
- Production image: ~180MB
- Reduction: ~70%

### Stellar Service
- Development image: ~600MB
- Production image: ~180MB
- Reduction: ~70%

## Caching Strategy

### Local Build Cache
The build script saves layer cache to `.docker-cache/` for faster rebuilds:
```bash
# First build
./scripts/docker-build.sh  # ~2-3 minutes

# Subsequent builds (with cache)
./scripts/docker-build.sh  # ~30-60 seconds
```

### CI/CD Caching
In GitHub Actions or similar CI systems:
- Use `docker/build-push-action` with cache mounts
- Store cache in registry or local storage
- Invalidate cache when dependencies change

## Dockerfile Organization

### Production Dockerfiles
- `apps/api/Dockerfile.prod`: API service production build
- `apps/stellar-service/Dockerfile.prod`: Stellar Service production build
- `apps/web/Dockerfile.prod`: Web frontend production build

### Development Dockerfiles
- `apps/api/Dockerfile`: Development build with hot-reload
- `apps/stellar-service/Dockerfile`: Development build with hot-reload

## Performance Tips

1. **Add .dockerignore entries**: Exclude files not needed in image
2. **Order layers by change frequency**: Stable layers first (dependencies)
3. **Use BuildKit**: Enable with `DOCKER_BUILDKIT=1`
4. **Multi-stage builds**: Always use for production images
5. **Alpine images**: Use for smaller base images (trade-off: compatibility)
6. **Scan regularly**: Run security scans in CI/CD pipeline

## Troubleshooting

### Build cache not working
- Ensure `DOCKER_BUILDKIT=1` is set
- Check `.docker-cache` directory exists
- Clear cache: `rm -rf .docker-cache/`

### Large image size
- Check `.dockerignore` is excluding unnecessary files
- Verify dev dependencies are removed in final stage
- Use `docker history` to identify large layers

### Scan failures
- Update Trivy: `trivy image --download-db-only`
- Review severity levels in build script
- Address vulnerabilities in dependencies

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Trivy Security Scanner](https://github.com/aquasecurity/trivy)
- [Docker BuildKit](https://docs.docker.com/build/buildkit/)
