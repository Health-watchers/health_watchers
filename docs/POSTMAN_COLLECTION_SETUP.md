# Postman Collection Setup & Configuration

**Issue #1584**: Documentation for Postman collection publishing and CI/CD integration.

This guide explains how to configure and use the Health Watchers Postman collection, including automated publishing via CI/CD.

---

## Overview

The Health Watchers API collection is:
- ✅ Generated from TypeScript/API code using `scripts/generate-postman.js`
- ✅ Validated against the OpenAPI specification
- ✅ Automatically published to a Postman workspace on merge to `main`
- ✅ Linked in pull requests for easy access
- ✅ Maintained with comprehensive examples and authentication flows

---

## Getting Started

### Option 1: Import from Postman Workspace (Recommended)

If your team has a Postman workspace configured:

1. Go to [Postman Web App](https://app.postman.com)
2. Sign in with your Postman account
3. Navigate to the **Health Watchers** workspace
4. Click **Collections** → **health-watchers**
5. Click **Import** or create a new request from the collection

### Option 2: Import from Local File

1. Download the collection file:
   ```bash
   # Option A: From repository
   git clone https://github.com/health-watchers/health_watchers.git
   
   # Option B: Direct download
   curl https://raw.githubusercontent.com/health-watchers/health_watchers/main/docs/postman/health-watchers.postman_collection.json -o collection.json
   ```

2. Open Postman and click **Import** button
3. Select the downloaded `collection.json` file
4. Collection will be imported with all requests and examples

---

## Collection Structure

The Postman collection is organized into the following main folders:

### 1. **Authentication**
- Login endpoint
- Registration
- Token refresh
- Password reset
- Multi-factor authentication

**Example Request:**
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

### 2. **Patients**
- Create patient
- List patients
- Get patient details
- Update patient profile
- Delete patient
- Patient search and filtering

**Prerequisites:** Requires valid `Authorization` header with bearer token

### 3. **Encounters**
- Create encounter
- List encounters
- Get encounter details
- Update encounter notes
- Close encounter
- AI summary generation

**Prerequisites:** Requires valid `Authorization` header and `patient_id`

### 4. **Payments**
- Create payment
- List payments
- Get payment details
- Refund payment
- Payment webhook events

**Prerequisites:** Requires valid `Authorization` header and Stellar integration

### 5. **Admin**
- User management
- Role assignment
- System configuration
- Audit logs

**Prerequisites:** Requires admin role

---

## Environment Variables

### Quick Setup with Pre-configured Environment

1. Download the environment file:
   ```bash
   curl https://raw.githubusercontent.com/health-watchers/health_watchers/main/docs/postman/health-watchers-env.postman_environment.json -o env.json
   ```

2. In Postman:
   - Click **Environments** (left sidebar)
   - Click **Import**
   - Select the downloaded `env.json`

3. In the top-right corner, select **health-watchers** from the environment dropdown

### Manual Environment Setup

If you prefer to create your own environment:

1. **Create a new environment** in Postman:
   - Click **Environments** → **Create**
   - Name it `health-watchers-local` (or your preference)

2. **Add the following variables:**

| Variable | Initial Value | Current Value | Notes |
|---|---|---|---|
| `BASE_URL` | `http://localhost:3000` | | API base URL (local/dev/staging/prod) |
| `AUTH_TOKEN` | `` | | Bearer token from login response (auto-set) |
| `USER_ID` | `` | | Current user ID (auto-set after login) |
| `PATIENT_ID` | `` | | Currently selected patient (set manually) |
| `ENCOUNTER_ID` | `` | | Currently selected encounter (set manually) |
| `API_KEY` | `your-api-key-here` | | API key for server-to-server calls |

3. **Save the environment**

### Auto-populating Variables with Tests

Most requests include post-request tests that automatically populate variables:

```javascript
// Automatically set AUTH_TOKEN from login response
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set("AUTH_TOKEN", response.token);
  pm.environment.set("USER_ID", response.user.id);
}
```

---

## Authentication Flows

### Bearer Token Authentication

Most endpoints require a bearer token:

```
Authorization: Bearer <token>
```

**Get a token:**

1. Use the **Auth** → **Login** request
2. Enter your credentials
3. Token is automatically set as `AUTH_TOKEN` environment variable
4. All subsequent requests use `{{AUTH_TOKEN}}` in the Authorization header

### API Key Authentication

For server-to-server communication:

```
X-API-Key: <api-key>
```

Set the `API_KEY` environment variable and use in headers:
```
X-API-Key: {{API_KEY}}
```

---

## Common Workflows

### Workflow 1: Create a Patient and Schedule an Encounter

1. **Login** (Auth → Login)
   - Sets `AUTH_TOKEN` automatically

2. **Create Patient** (Patients → Create Patient)
   - Fill in patient details
   - Note the returned `patient_id`
   - Manually set `PATIENT_ID` environment variable

3. **Create Encounter** (Encounters → Create Encounter)
   - Use `{{PATIENT_ID}}` from previous step
   - Encounter `encounter_id` is auto-set

4. **Get Encounter** (Encounters → Get Encounter Details)
   - Automatically uses the `ENCOUNTER_ID` from step 3

### Workflow 2: Process a Payment

1. **Create Payment** (Payments → Create Payment)
   - Specify patient and amount
   - Payment status is `pending`

2. **Webhook Simulator** (Payments → Webhook Event)
   - Simulates Stellar network confirmation
   - Updates payment status to `confirmed`

3. **Get Payment** (Payments → Get Payment)
   - Verify payment is confirmed
   - Check transaction hash

---

## Pre-request Scripts

Requests often include pre-request scripts that set up required variables:

```javascript
// Example: Set timestamp for pagination
pm.environment.set("timestamp", new Date().toISOString());

// Example: Calculate signature for protected endpoints
const crypto = require('crypto');
const message = pm.variables.get("BASE_URL");
const signature = crypto.createHmac('sha256', pm.variables.get("API_KEY"))
  .update(message)
  .digest('hex');
pm.environment.set("signature", signature);
```

---

## Generating/Updating the Collection

The collection is automatically generated from TypeScript code and OpenAPI specs.

### Regenerate Locally

```bash
npm run postman:generate
```

This reads:
- `apps/api/src/openapi-spec.ts` - OpenAPI definition
- `docs/postman/**` - Examples and overrides
- `scripts/generate-postman.js` - Generation script

Output: `docs/postman/health-watchers.postman_collection.json`

### CI/CD Auto-generation

On every push to `main`:
1. `postman-sync` CI job runs
2. Regenerates the collection
3. Validates against OpenAPI spec
4. Publishes to Postman workspace (if secrets configured)
5. Posts link to workspace in PR comments

---

## Setting Up CI/CD Publishing

### Prerequisites

1. **Postman Account** (free or pro)
2. **Postman API Key**
3. **Collection UID**

### Step 1: Get Your Postman API Key

1. Go to [Postman Settings → API Keys](https://www.postman.com/settings/me/api-keys)
2. Click **Generate API Key**
3. Choose name (e.g., "GitHub Actions")
4. Copy the generated key

### Step 2: Find Your Collection UID

1. Open Postman Web App
2. Open your collection
3. Click collection menu (…) → **Settings**
4. Under **Collection Details**, find **UID**
5. Copy the UID

### Step 3: Add Repository Secrets

In GitHub repository settings:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add two secrets:

| Name | Value |
|---|---|
| `POSTMAN_API_KEY` | Your API key from Step 1 |
| `POSTMAN_COLLECTION_UID` | Your collection UID from Step 2 |

### Step 4: Verify Publishing

1. Make a change to the API code
2. Push to `main` branch
3. GitHub Actions runs `postman-sync` job
4. Check job logs for success:
   ```
   ✅ Postman collection published successfully
   ```
5. Open your Postman workspace to see the updated collection

---

## API Examples in Collection

Each request includes:
- ✅ **Description** - What the endpoint does
- ✅ **Request body** - Pre-filled example with required fields
- ✅ **Response examples** - Common success/error responses
- ✅ **Test scripts** - Validation and environment variable updates
- ✅ **Pre-request scripts** - Auth and data setup

### Example: Create Patient

**Request:**
```
POST {{BASE_URL}}/patients
Authorization: Bearer {{AUTH_TOKEN}}
Content-Type: application/json

{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "dateOfBirth": "1990-01-15",
  "medicalHistory": [...]
}
```

**Response (200):**
```json
{
  "id": "patient_123abc",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "createdAt": "2026-10-17T10:30:00Z"
}
```

**Test:**
```javascript
pm.test("Status code is 201", () => pm.response.to.have.status(201));
pm.test("Has patient ID", () => pm.response.json().id !== undefined);
pm.environment.set("PATIENT_ID", pm.response.json().id);
```

---

## Troubleshooting

### "401 Unauthorized"
- **Cause:** Invalid or expired token
- **Solution:** Re-run the **Login** request to get a new token

### "400 Bad Request"
- **Cause:** Invalid request body or parameters
- **Solution:** Check the request body matches the schema shown in the collection

### "500 Internal Server Error"
- **Cause:** Server-side issue
- **Solution:** Check server logs and GitHub Issues

### "Collection not updating in workspace"
- **Cause:** Postman secrets not configured
- **Solution:** Verify `POSTMAN_API_KEY` and `POSTMAN_COLLECTION_UID` are set in GitHub secrets

### "Pre-request script fails"
- **Cause:** Missing environment variable
- **Solution:** Check all required variables are set in the active environment

---

## Best Practices

1. **Use Environments** - Keep dev/staging/prod URLs separate
2. **Save Responses** - Postman allows saving responses as examples
3. **Use Collections** - Organize requests logically by feature
4. **Parameterize** - Use `{{variable}}` syntax for all dynamic values
5. **Document** - Add descriptions to custom requests
6. **Test** - Include assertions in post-request tests
7. **Share** - Export workspace for team distribution

---

## Team Collaboration

### Sharing via Workspace

1. In Postman, click **Workspace** menu
2. Click **Share collection**
3. Add team members via email
4. Set permissions (Viewer / Editor / Admin)

### Syncing with Git

The collection is version-controlled:
```bash
# Collection is at:
docs/postman/health-watchers.postman_collection.json

# Export to file for sharing:
git add docs/postman/
git commit -m "docs: update Postman collection"
git push
```

---

## Advanced: Custom Workflows

### Mock Server Testing

Use Postman Mock Servers:
1. Collection → Mock Server
2. Click **Create Mock Server**
3. Use mock server URL as `BASE_URL`

### Automated Testing

Run collection via Newman (CLI):
```bash
# Install
npm install -g newman

# Run
newman run docs/postman/health-watchers.postman_collection.json \
  -e environment.json \
  --reporters cli,json
```

---

## Support

For issues with:
- **Collection structure** → GitHub Issues (health-watchers/health_watchers)
- **Postman functionality** → [Postman Docs](https://learning.postman.com/)
- **API endpoints** → See `docs/openapi.yaml`

---

**Last Updated**: 2026-10-17  
**Issue**: #1584
