/**
 * Simple verification script for audit logging implementation
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Audit Logging Implementation...\n');

const checks = {
  passed: 0,
  failed: 0,
  total: 0,
};

function check(name, condition, message) {
  checks.total++;
  if (condition) {
    checks.passed++;
    console.log(`✓ ${name}`);
    if (message) console.log(`  ${message}`);
  } else {
    checks.failed++;
    console.log(`✗ ${name}`);
    if (message) console.log(`  ${message}`);
  }
}

// Check 1: Verify audit model file exists
const auditModelPath = path.join(__dirname, '../apps/api/src/modules/audit/audit.model.ts');
check('Audit Model File', fs.existsSync(auditModelPath), 'audit.model.ts exists');

// Check 2: Verify audit service file exists
const auditServicePath = path.join(__dirname, '../apps/api/src/modules/audit/audit.service.ts');
check('Audit Service File', fs.existsSync(auditServicePath), 'audit.service.ts exists');

// Check 3: Verify audit controller file exists
const auditControllerPath = path.join(
  __dirname,
  '../apps/api/src/modules/audit/audit.controller.ts'
);
check('Audit Controller File', fs.existsSync(auditControllerPath), 'audit.controller.ts exists');

// Check 4: Verify audit middleware file exists
const auditMiddlewarePath = path.join(__dirname, '../apps/api/src/middlewares/audit.middleware.ts');
check('Audit Middleware File', fs.existsSync(auditMiddlewarePath), 'audit.middleware.ts exists');

// Check 5: Verify auth middleware file exists
const authMiddlewarePath = path.join(__dirname, '../apps/api/src/middlewares/auth.middleware.ts');
check('Auth Middleware File', fs.existsSync(authMiddlewarePath), 'auth.middleware.ts exists');

// Check 6: Verify audit model has required fields
if (fs.existsSync(auditModelPath)) {
  const modelContent = fs.readFileSync(auditModelPath, 'utf8');
  const requiredFields = [
    'userId',
    'clinicId',
    'action',
    'resourceType',
    'resourceId',
    'ipAddress',
    'userAgent',
    'outcome',
    'timestamp',
  ];

  requiredFields.forEach((field) => {
    check(
      `Model Field: ${field}`,
      modelContent.includes(field),
      `Field '${field}' defined in schema`
    );
  });
}

// Check 7: Verify all required actions are defined
if (fs.existsSync(auditModelPath)) {
  const modelContent = fs.readFileSync(auditModelPath, 'utf8');
  const requiredActions = [
    'LOGIN_SUCCESS',
    'LOGIN_FAILURE',
    'PATIENT_VIEW',
    'PATIENT_CREATE',
    'PATIENT_UPDATE',
    'PATIENT_DELETE',
    'ENCOUNTER_VIEW',
    'ENCOUNTER_CREATE',
    'ENCOUNTER_UPDATE',
    'PAYMENT_CREATE',
    'EXPORT_PATIENT_DATA',
  ];

  requiredActions.forEach((action) => {
    check(`Action: ${action}`, modelContent.includes(action), `Action '${action}' defined in enum`);
  });
}

// Check 8: Verify immutability protection
if (fs.existsSync(auditModelPath)) {
  const modelContent = fs.readFileSync(auditModelPath, 'utf8');
  check(
    'Immutability: Update Protection',
    modelContent.includes('updateOne') && modelContent.includes('immutable'),
    'Pre-hooks prevent updates'
  );
  check(
    'Immutability: Delete Protection',
    modelContent.includes('deleteOne') && modelContent.includes('immutable'),
    'Pre-hooks prevent deletes'
  );
}

// Check 9: Verify audit routes are registered in app.ts
const appPath = path.join(__dirname, '../apps/api/src/app.ts');
if (fs.existsSync(appPath)) {
  const appContent = fs.readFileSync(appPath, 'utf8');
  check(
    'Routes: Audit routes imported',
    appContent.includes('auditRoutes'),
    'auditRoutes imported in app.ts'
  );
  check(
    'Routes: Audit routes registered',
    appContent.includes('/api/v1/audit-logs') && appContent.includes('auditRoutes'),
    'Audit routes registered at /api/v1/audit-logs'
  );
}

// Check 10: Verify auth controller has audit logging
const authControllerPath = path.join(__dirname, '../apps/api/src/modules/auth/auth.controller.ts');
if (fs.existsSync(authControllerPath)) {
  const authContent = fs.readFileSync(authControllerPath, 'utf8');
  check(
    'Integration: Auth controller imports auditLog',
    authContent.includes('auditLog'),
    'auditLog imported in auth controller'
  );
  check(
    'Integration: LOGIN_SUCCESS logged',
    authContent.includes('LOGIN_SUCCESS'),
    'LOGIN_SUCCESS event logged'
  );
  check(
    'Integration: LOGIN_FAILURE logged',
    authContent.includes('LOGIN_FAILURE'),
    'LOGIN_FAILURE event logged'
  );
}

// Check 11: Verify patient controller exists with audit logging
const patientControllerPath = path.join(
  __dirname,
  '../apps/api/src/modules/patients/patients.controller.ts'
);
if (fs.existsSync(patientControllerPath)) {
  const patientContent = fs.readFileSync(patientControllerPath, 'utf8');
  check(
    'Integration: Patient controller has audit logging',
    patientContent.includes('auditLog') || patientContent.includes('auditMiddleware'),
    'Patient operations are audited'
  );
  check(
    'Integration: PATIENT_VIEW logged',
    patientContent.includes('PATIENT_VIEW'),
    'PATIENT_VIEW event logged'
  );
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 Test Results: ${checks.passed}/${checks.total} checks passed`);
if (checks.failed > 0) {
  console.log(`❌ ${checks.failed} checks failed`);
} else {
  console.log('✅ All checks passed!');
}

console.log('\n📝 Next Steps:');
console.log('1. Ensure MongoDB is running');
console.log('2. Set up environment variables (JWT secrets, MongoDB URI)');
console.log('3. Start the API server: npm run dev');
console.log('4. Test login endpoint to generate audit logs');
console.log('5. Query GET /api/v1/audit-logs as SUPER_ADMIN');

process.exit(checks.failed > 0 ? 1 : 0);
