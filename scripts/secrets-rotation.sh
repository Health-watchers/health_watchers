#!/bin/bash
# Secrets rotation script
# Usage: bash scripts/secrets-rotation.sh <secret_type> <environment>

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SECRET_TYPE="${1:-}"
ENVIRONMENT="${2:-prod}"

print_usage() {
  echo "Usage: bash scripts/secrets-rotation.sh <secret_type> <environment>"
  echo ""
  echo "Secret Types:"
  echo "  jwt               - JWT access and refresh tokens"
  echo "  mongo             - MongoDB credentials"
  echo "  stellar           - Stellar blockchain secret key"
  echo "  gemini            - Gemini API key"
  echo "  all               - Rotate all secrets"
  echo ""
  echo "Environments:"
  echo "  dev   - Development (local)"
  echo "  stage - Staging"
  echo "  prod  - Production (requires confirmation)"
}

if [[ -z "$SECRET_TYPE" ]]; then
  print_usage
  exit 1
fi

if [[ "$ENVIRONMENT" == "prod" ]]; then
  echo -e "${YELLOW}⚠️  You are about to rotate secrets in PRODUCTION${NC}"
  echo ""
  read -p "Type 'yes' to confirm: " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Rotation cancelled"
    exit 0
  fi
fi

generate_random_secret() {
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
}

rotate_jwt_secrets() {
  echo -e "${BLUE}🔄 Rotating JWT Secrets...${NC}"
  echo ""
  
  echo "Generating new access token secret:"
  NEW_ACCESS_SECRET=$(generate_random_secret)
  echo "✓ Generated"
  echo ""
  
  echo "Generating new refresh token secret:"
  NEW_REFRESH_SECRET=$(generate_random_secret)
  echo "✓ Generated"
  echo ""
  
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Update Secrets Manager:"
  echo "   aws secretsmanager update-secret \\"
  echo "     --secret-id health-watchers/$ENVIRONMENT/api \\"
  echo "     --secret-string '{\"JWT_ACCESS_TOKEN_SECRET\": \"$NEW_ACCESS_SECRET\", \"JWT_REFRESH_TOKEN_SECRET\": \"$NEW_REFRESH_SECRET\"}'"
  echo ""
  echo "2. Restart API service:"
  echo "   docker-compose restart api"
  echo ""
  echo "3. Monitor logs for errors:"
  echo "   docker-compose logs -f api"
  echo ""
  echo "4. Test authentication:"
  echo "   curl -X POST http://api:3001/api/v1/auth/login \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"email\": \"test@example.com\", \"password\": \"password\"}'"
}

rotate_mongo_credentials() {
  echo -e "${BLUE}🔄 Rotating MongoDB Credentials...${NC}"
  echo ""
  
  NEW_USERNAME="health_watchers_$(date +%s)"
  NEW_PASSWORD=$(generate_random_secret | head -c 32)
  
  echo "New MongoDB username: $NEW_USERNAME"
  echo "⚠️  Save this password securely"
  echo ""
  
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Connect to MongoDB and create new user:"
  echo "   docker-compose exec mongodb mongosh"
  echo "   > use admin"
  echo "   > db.createUser({"
  echo "   >   user: \"$NEW_USERNAME\","
  echo "   >   pwd: \"$NEW_PASSWORD\","
  echo "   >   roles: [{role: \"readWrite\", db: \"health_watchers\"}]"
  echo "   > })"
  echo ""
  echo "2. Update Secrets Manager:"
  echo "   aws secretsmanager update-secret \\"
  echo "     --secret-id health-watchers/$ENVIRONMENT/api \\"
  echo "     --secret-string '{\"MONGO_URI\": \"mongodb://$NEW_USERNAME:$NEW_PASSWORD@mongodb:27017/health_watchers?authSource=admin\"}'"
  echo ""
  echo "3. Restart API service:"
  echo "   docker-compose restart api"
  echo ""
  echo "4. Once verified, drop old user:"
  echo "   docker-compose exec mongodb mongosh"
  echo "   > use admin"
  echo "   > db.dropUser('health_watchers_old')"
}

rotate_stellar_secrets() {
  echo -e "${BLUE}🔄 Rotating Stellar Secrets...${NC}"
  echo ""
  
  echo "Generating new Stellar keypair:"
  NEW_SECRET=$(node -e "const sk = require('@stellar/stellar-sdk'); const kp = sk.Keypair.random(); console.log(kp.secret())")
  NEW_PUBLIC=$(node -e "const sk = require('@stellar/stellar-sdk'); const kp = sk.Keypair.fromSecret('$NEW_SECRET'); console.log(kp.publicKey())")
  
  echo "✓ Generated"
  echo ""
  echo "New public key: $NEW_PUBLIC"
  echo ""
  
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Fund the new Stellar account with required XLM"
  echo ""
  echo "2. Update Secrets Manager:"
  echo "   aws secretsmanager update-secret \\"
  echo "     --secret-id health-watchers/$ENVIRONMENT/stellar \\"
  echo "     --secret-string '{\"STELLAR_SECRET_KEY\": \"$NEW_SECRET\"}'"
  echo ""
  echo "3. Restart Stellar service:"
  echo "   docker-compose restart stellar-service"
  echo ""
  echo "4. Test transactions:"
  echo "   curl -X POST http://stellar-service:3002/fund \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"publicKey\": \"$NEW_PUBLIC\"}'"
}

rotate_gemini_api_key() {
  echo -e "${BLUE}🔄 Rotating Gemini API Key...${NC}"
  echo ""
  
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Go to Google Cloud Console"
  echo "2. Navigate to APIs & Services > Credentials"
  echo "3. Create a new API key"
  echo "4. Set appropriate restrictions (IP, referrer, API)"
  echo ""
  echo "5. Update Secrets Manager:"
  echo "   aws secretsmanager update-secret \\"
  echo "     --secret-id health-watchers/$ENVIRONMENT/external \\"
  echo "     --secret-string '{\"GEMINI_API_KEY\": \"YOUR_NEW_KEY\"}'"
  echo ""
  echo "6. Restart API service:"
  echo "   docker-compose restart api"
  echo ""
  echo "7. Test AI functionality:"
  echo "   curl -X POST http://api:3001/api/v1/ai/analyze \\"
  echo "     -H 'Authorization: Bearer TOKEN'"
  echo ""
  echo "8. Delete old API key from Google Cloud Console"
}

case "$SECRET_TYPE" in
  jwt)
    rotate_jwt_secrets
    ;;
  mongo)
    rotate_mongo_credentials
    ;;
  stellar)
    rotate_stellar_secrets
    ;;
  gemini)
    rotate_gemini_api_key
    ;;
  all)
    rotate_jwt_secrets
    echo ""
    rotate_mongo_credentials
    echo ""
    rotate_stellar_secrets
    echo ""
    rotate_gemini_api_key
    ;;
  *)
    echo -e "${RED}Unknown secret type: $SECRET_TYPE${NC}"
    echo ""
    print_usage
    exit 1
    ;;
esac

echo -e "${GREEN}✓ Rotation steps generated${NC}"
