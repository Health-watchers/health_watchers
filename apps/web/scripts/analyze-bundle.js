#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Bundle size budget in KB
const BUNDLE_BUDGET = {
  main: 100,
  'react-vendors': 150,
  common: 50,
  vendors: 300,
};

// Target for overall bundle reduction
const TARGET_REDUCTION = 0.3; // 30% reduction

function analyzeBundle() {
  const nextDir = path.join(process.cwd(), '.next');

  if (!fs.existsSync(nextDir)) {
    console.error('❌ .next directory not found. Build the project first.');
    process.exit(1);
  }

  const staticDir = path.join(nextDir, 'static');
  const bundlesDir = path.join(staticDir, 'chunks');

  if (!fs.existsSync(bundlesDir)) {
    console.error('❌ Chunks directory not found.');
    process.exit(1);
  }

  const files = fs.readdirSync(bundlesDir).filter((f) => f.endsWith('.js'));
  const bundles = {};
  let totalSize = 0;

  files.forEach((file) => {
    const filePath = path.join(bundlesDir, file);
    const stats = fs.statSync(filePath);
    const sizeKb = stats.size / 1024;

    bundles[file] = sizeKb;
    totalSize += stats.size;
  });

  const totalSizeKb = totalSize / 1024;
  const mainFile = Object.entries(bundles).find(([name]) => name.includes('main'));
  const mainSizeKb = mainFile ? mainFile[1] : 0;

  // Print report
  console.log('\n📊 Bundle Analysis Report\n');
  console.log(`Total Bundle Size: ${totalSizeKb.toFixed(2)} KB\n`);

  console.log('Bundle Breakdown:');
  const sorted = Object.entries(bundles)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  sorted.forEach(([name, size]) => {
    const status = size > 100 ? '⚠️ ' : '✓ ';
    console.log(`  ${status} ${name.padEnd(40)} ${size.toFixed(2)} KB`);
  });

  // Check budgets
  console.log('\n📋 Budget Check:\n');
  let budgetExceeded = false;

  Object.entries(BUNDLE_BUDGET).forEach(([name, limit]) => {
    const matchingFile = Object.entries(bundles).find(([fileName]) =>
      fileName.includes(name.replace(/-vendors/, ''))
    );

    if (matchingFile) {
      const [fileName, size] = matchingFile;
      const exceeded = size > limit;
      const icon = exceeded ? '❌' : '✅';
      console.log(`${icon} ${name.padEnd(20)} ${size.toFixed(2)} KB / ${limit} KB`);
      if (exceeded) budgetExceeded = true;
    }
  });

  // Recommendations
  console.log('\n💡 Recommendations:\n');
  console.log('1. Use dynamic imports for heavy components');
  console.log('2. Lazy load route-specific dependencies');
  console.log('3. Enable tree-shaking in unused imports');
  console.log('4. Consider splitting UI components by feature');
  console.log('5. Analyze and optimize chart library usage');

  if (budgetExceeded) {
    console.log('\n❌ Bundle size budget exceeded!');
    process.exit(1);
  } else {
    console.log('\n✅ All bundles within budget!\n');
  }
}

analyzeBundle();
