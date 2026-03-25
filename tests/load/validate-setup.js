#!/usr/bin/env node

/**
 * Load Testing Setup Validation Script
 * 
 * This script validates that the load testing setup is correct
 * without requiring k6 to be installed.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Load Testing Setup...\n');

// Check if test files exist
const testFiles = [
  'patients.js',
  'api.js',
  'README.md'
];

const testDir = __dirname;

let allValid = true;

// Validate test files
testFiles.forEach(file => {
  const filePath = path.join(testDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file} - Found`);
    
    // Check syntax for JS files
    if (file.endsWith('.js')) {
      try {
        require('child_process').execSync(`node -c ${filePath}`);
        console.log(`   ✅ Syntax validation passed`);
      } catch (error) {
        console.log(`   ❌ Syntax validation failed`);
        allValid = false;
      }
    }
  } else {
    console.log(`❌ ${file} - Missing`);
    allValid = false;
  }
});

// Check package.json for k6 dependency
const apiPackageJsonPath = path.join(__dirname, '../../apps/api/package.json');
if (fs.existsSync(apiPackageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(apiPackageJsonPath, 'utf8'));
    
    if (packageJson.devDependencies && packageJson.devDependencies.k6) {
      console.log(`✅ k6 dependency found in package.json`);
    } else {
      console.log(`❌ k6 dependency missing from package.json`);
      allValid = false;
    }
    
    if (packageJson.scripts && packageJson.scripts['test:load']) {
      console.log(`✅ test:load script found in package.json`);
    } else {
      console.log(`❌ test:load script missing from package.json`);
      allValid = false;
    }
  } catch (error) {
    console.log(`❌ Could not parse package.json`);
    allValid = false;
  }
} else {
  console.log(`❌ package.json not found`);
  allValid = false;
}

// Check if k6 is available
try {
  require('child_process').execSync('k6 --version', { stdio: 'ignore' });
  console.log(`✅ k6 is available globally`);
} catch (error) {
  console.log(`⚠️  k6 is not available globally (install with: npm install -g k6)`);
}

console.log('\n' + '='.repeat(50));

if (allValid) {
  console.log('🎉 Load testing setup validation PASSED!');
  console.log('\nTo run load tests:');
  console.log('1. Start the API: npm run dev (from apps/api)');
  console.log('2. Run tests: npm run test:load');
  console.log('3. Or run specific test: k6 run tests/load/patients.js');
} else {
  console.log('❌ Load testing setup validation FAILED!');
  console.log('Please fix the issues above before running load tests.');
}

console.log('\n' + '='.repeat(50));