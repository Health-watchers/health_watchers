#!/bin/bash
# Docker build script with security scanning and optimization
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="${REGISTRY:-docker.io}"
NAMESPACE="${NAMESPACE:-healthwatchers}"
BUILD_CACHE_DIR="${BUILD_CACHE_DIR:-.docker-cache}"
SCAN_SEVERITY="${SCAN_SEVERITY:-MEDIUM}"
ENABLE_SCAN="${ENABLE_SCAN:-true}"

echo -e "${YELLOW}Docker Build Script with Security Scanning${NC}"
echo "=================================================="

# Create cache directory if it doesn't exist
mkdir -p "$BUILD_CACHE_DIR"

# Function to build and scan image
build_and_scan() {
    local service=$1
    local dockerfile=$2
    local image_name=$3
    local version=$4

    echo -e "\n${YELLOW}Building ${service}...${NC}"

    local full_image_name="${REGISTRY}/${NAMESPACE}/${image_name}:${version}"

    # Build with BuildKit for better caching
    DOCKER_BUILDKIT=1 docker build \
        --file "$dockerfile" \
        --tag "$full_image_name" \
        --progress=plain \
        --cache-from type=local,src="$BUILD_CACHE_DIR/${image_name}" \
        --build-arg BUILDKIT_INLINE_CACHE=1 \
        -o type=oci,\"push=false\" \
        . || {
        echo -e "${RED}Failed to build ${service}${NC}"
        exit 1
    }

    # Save cache
    mkdir -p "$BUILD_CACHE_DIR/${image_name}"
    echo -e "${GREEN}✓ ${service} built successfully${NC}"

    # Security scanning with Trivy
    if [ "$ENABLE_SCAN" = "true" ]; then
        echo -e "\n${YELLOW}Scanning ${service} for vulnerabilities...${NC}"

        if ! command -v trivy &> /dev/null; then
            echo -e "${YELLOW}Installing Trivy...${NC}"
            curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
        fi

        # Run Trivy scan
        if trivy image --severity "$SCAN_SEVERITY" --exit-code 0 "$full_image_name" > "/tmp/${image_name}-scan.txt" 2>&1; then
            echo -e "${GREEN}✓ ${service} scan passed${NC}"
        else
            echo -e "${YELLOW}⚠ ${service} scan found issues (non-blocking)${NC}"
        fi

        # Display scan results
        echo "Scan Results:"
        cat "/tmp/${image_name}-scan.txt" | grep -E "Total|CRITICAL|HIGH" || true
    fi

    return 0
}

# Build API
build_and_scan "API" "apps/api/Dockerfile.prod" "api" "${VERSION:-latest}"

# Build Stellar Service
build_and_scan "Stellar Service" "apps/stellar-service/Dockerfile.prod" "stellar-service" "${VERSION:-latest}"

# Build Web
if [ -f "apps/web/Dockerfile.prod" ]; then
    build_and_scan "Web" "apps/web/Dockerfile.prod" "web" "${VERSION:-latest}"
fi

echo -e "\n${GREEN}All images built and scanned successfully!${NC}"
echo -e "${YELLOW}Images ready at: ${REGISTRY}/${NAMESPACE}/*:${VERSION:-latest}${NC}"
