#!/usr/bin/env node
/**
 * scripts/generate-postman.js
 *
 * Generates / validates the Postman collection against the live OpenAPI spec.
 *
 * Usage:
 *   node scripts/generate-postman.js            # validate only (CI mode)
 *   node scripts/generate-postman.js --update   # overwrite collection file
 *
 * Requires: npm install -g openapi-to-postmanv2
 * Or run via: npx openapi-to-postmanv2
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLLECTION_PATH = path.resolve(
  __dirname,
  '../docs/postman/health-watchers.postman_collection.json'
);
const OPENAPI_PATH = path.resolve(__dirname, '../apps/api/docs/openapi.json');

const update = process.argv.includes('--update');

// ── 1. Export OpenAPI spec from the running API (or use cached file) ──────────
function exportOpenApiSpec() {
  // Try to fetch from live server first; fall back to generating via ts-node
  try {
    const raw = execSync('curl -sf http://localhost:3001/api/docs/swagger.json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000,
    });
    return JSON.parse(raw);
  } catch {
    // Not running — generate from source using swagger-jsdoc
    console.log('API not running; generating spec from source…');
    const spec = execSync(
      `node -e "
        const swaggerJsdoc = require('swagger-jsdoc');
        const path = require('path');
        // Minimal options pointing at the api src
        const opts = {
          definition: { openapi: '3.0.3', info: { title: 'Health Watchers API', version: '1.0.0' } },
          apis: ['${path.resolve(__dirname, '../apps/api/src')}/**/*.ts'],
        };
        process.stdout.write(JSON.stringify(swaggerJsdoc(opts)));
      "`,
      { encoding: 'utf8', cwd: path.resolve(__dirname, '../apps/api') }
    );
    return JSON.parse(spec);
  }
}

// ── 2. Convert OpenAPI → Postman using openapi-to-postmanv2 ──────────────────
function convertToPostman(openapiSpec) {
  const tmpInput = path.resolve(__dirname, '../.tmp-openapi.json');
  const tmpOutput = path.resolve(__dirname, '../.tmp-postman.json');

  fs.writeFileSync(tmpInput, JSON.stringify(openapiSpec, null, 2));

  try {
    execSync(
      `npx --yes openapi-to-postmanv2 -s "${tmpInput}" -o "${tmpOutput}" -p -O folderStrategy=Tags,requestParametersResolution=Example,optimizeConversion=false`,
      { stdio: 'pipe' }
    );
    return JSON.parse(fs.readFileSync(tmpOutput, 'utf8'));
  } finally {
    [tmpInput, tmpOutput].forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });
  }
}

// ── 3. Pagination schema helpers ──────────────────────────────────────────────
// List endpoints that must expose the standardized pagination query params.
const PAGINATED_FOLDERS = [
  'Patients',
  'Encounters',
  'Payments',
  'Invoices',
  'Appointments',
  'Notifications',
  'Communications',
];

// Query params every paginated list endpoint must document.
const REQUIRED_QUERY_PARAMS = ['page', 'limit', 'sort', 'cursor'];

// Recursively collect all requests (items with a `request`) from a folder tree.
function collectRequests(items, acc = []) {
  for (const item of items || []) {
    if (item.request) {
      acc.push(item);
    }
    if (Array.isArray(item.item)) {
      collectRequests(item.item, acc);
    }
  }
  return acc;
}

// Extract query param keys from a Postman request URL (string or object form).
function getQueryParamKeys(request) {
  const url = request && request.url;
  if (!url) return [];
  if (typeof url === 'string') {
    const qs = url.split('?')[1] || '';
    return qs
      .split('&')
      .filter(Boolean)
      .map((pair) => decodeURIComponent(pair.split('=')[0]));
  }
  if (Array.isArray(url.query)) {
    return url.query.map((q) => q.key);
  }
  return [];
}

// Check whether a request's example response body uses the { data, pagination } shape.
function hasStandardPaginationShape(request) {
  const responses = (request && request.response) || [];
  return responses.some((res) => {
    const body = res && res.body;
    if (typeof body !== 'string') return false;
    try {
      const parsed = JSON.parse(body);
      return (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray(parsed.data) &&
        parsed.pagination &&
        typeof parsed.pagination === 'object' &&
        'total' in parsed.pagination &&
        'page' in parsed.pagination &&
        'limit' in parsed.pagination &&
        'hasMore' in parsed.pagination
      );
    } catch {
      return false;
    }
  });
}

// ── 4. Validate collection covers required folders & pagination schema ────────
function validateCollection(collection) {
  const required = [
    'Auth',
    'Patients',
    'Encounters',
    'Payments',
    'Invoices',
    'Appointments',
    'Notifications',
    'Communications',
    'Attachments',
  ];
  const folders = (collection.item || []).map((i) => i.name);
  const missing = required.filter(
    (r) => !folders.some((f) => f.toLowerCase().includes(r.toLowerCase()))
  );

  if (missing.length > 0) {
    console.error(`❌ Collection missing required folders: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Validate pagination query params + response shape on paginated list folders.
  const errors = [];
  for (const folderName of PAGINATED_FOLDERS) {
    const folder = (collection.item || []).find((f) =>
      f.name.toLowerCase().includes(folderName.toLowerCase())
    );
    if (!folder) continue; // already reported as missing above

    const requests = collectRequests(folder.item);
    if (requests.length === 0) {
      errors.push(`${folderName}: no requests found`);
      continue;
    }

    for (const req of requests) {
      const label = `${folderName} › ${req.name || '(unnamed request)'}`;
      const paramKeys = getQueryParamKeys(req.request).map((k) => k.toLowerCase());
      const missingParams = REQUIRED_QUERY_PARAMS.filter(
        (p) => !paramKeys.includes(p)
      );
      if (missingParams.length > 0) {
        errors.push(`${label}: missing query params [${missingParams.join(', ')}]`);
      }
      if (!hasStandardPaginationShape(req.request)) {
        errors.push(`${label}: response example missing { data, pagination } shape`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ Pagination schema validation failed:');
    errors.forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log(`✅ Collection validated — folders present: ${folders.join(', ')}`);
  console.log(
    `✅ Pagination schema validated for: ${PAGINATED_FOLDERS.join(', ')}`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (update) {
  console.log('Generating Postman collection from OpenAPI spec…');
  const spec = exportOpenApiSpec();
  const collection = augmentCollection(convertToPostman(spec));
  validateCollection(collection);
  fs.writeFileSync(COLLECTION_PATH, JSON.stringify(collection, null, 2));
  console.log(`✅ Written to ${COLLECTION_PATH}`);
} else {
  // Validate mode: just check the existing collection has the required folders
  console.log('Validating existing Postman collection…');
  if (!fs.existsSync(COLLECTION_PATH)) {
    console.error(`❌ Collection not found at ${COLLECTION_PATH}`);
    process.exit(1);
  }
  const collection = augmentCollection(JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf8')));
  validateCollection(collection);
}
