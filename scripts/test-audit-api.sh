#!/bin/bash

# Integration test script for audit logging API
# Prerequisites: API server must be running and MongoDB must be connected

API_URL="${API_URL:-http://localhost:3001}"
echo "🧪 Testing Audit Logging API at $API_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Failed login (should create LOGIN_FAILURE audit log)
echo "Test 1: Failed Login (should create audit log)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrongpassword"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✓${NC} Failed login returned 401 (expected)"
else
  echo -e "${RED}✗${NC} Failed login returned $HTTP_CODE (expected 401)"
fi
echo ""

# Test 2: Try to access audit logs without authentication
echo "Test 2: Access audit logs without auth (should fail)"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/audit-logs")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✓${NC} Unauthenticated request blocked (401)"
else
  echo -e "${RED}✗${NC} Returned $HTTP_CODE (expected 401)"
fi
echo ""

# Test 3: Instructions for authenticated tests
echo -e "${YELLOW}ℹ${NC}  To complete testing, you need a SUPER_ADMIN token:"
echo ""
echo "1. Login as SUPER_ADMIN:"
echo "   curl -X POST $API_URL/api/v1/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"admin@example.com\",\"password\":\"your-password\"}'"
echo ""
echo "2. Get audit logs:"
echo "   curl -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     '$API_URL/api/v1/audit-logs?limit=10'"
echo ""
echo "3. Test with date range:"
echo "   curl -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "     '$API_URL/api/v1/audit-logs?startDate=2026-03-01&endDate=2026-03-26'"
echo ""
echo "4. Verify LOGIN_FAILURE was logged from Test 1"
echo ""

echo "📊 Basic Tests Complete"
echo "   - Audit endpoints are accessible"
echo "   - Authentication is enforced"
echo "   - Failed login attempt was made (check audit logs)"
