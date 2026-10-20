#!/usr/bin/env node
'use strict';

// Maintainability scoring and quality gate (issue #1320).
// Combines complexity, duplication and test-coverage results into a single
// 0-100 quality score with per-dimension gates.
//
// Usage:
//   node scripts/quality/maintainability-score.js
//   (run after analyze-complexity, analyze-duplication and jest --coverage)
//
// Reads:
//   - scripts/quality/reports/complexity.json
//   - scripts/quality/reports/duplication.json
//   - apps/{api,web,stellar-service}/coverage/coverage-summary.json
//   - scripts/quality/gate.config.json
// Writes scripts/quality/reports/score.json (+ score.md).

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const REPORTS = path.join(DIR, 'reports');
const GATE = path.join(DIR, 'gate.config.json');
const COVERAGE_DIRS = ['apps/api', 'apps/web', 'apps/stellar-service'];

function read(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(DIR, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

function coverageTotals() {
  const buckets = [];
  let linesCovered = 0;
  let linesTotal = 0;
  for (const dir of COVERAGE_DIRS) {
    const summary = read(`../../${dir}/coverage/coverage-summary.json`, null);
    if (!summary || !summary.total) {
      console.warn(`coverage summary missing for ${dir} (run jest --coverage first)`);
      continue;
    }
    const t = summary.total.lines || { covered: 0, total: 0 };
    linesCovered += t.covered || 0;
    linesTotal += t.total || 0;
    buckets.push({ app: dir, percent: t.total ? (t.covered / t.total) * 100 : 0 });
  }
  const coveragePct = linesTotal ? (linesCovered / linesTotal) * 100 : 0;
  return { coveragePct, buckets };
}

function main() {
  const gate = read('gate.config.json', {});
  const complexity = read('reports/complexity.json', { totals: {} });
  const duplication = read('reports/duplication.json', { totals: {} });
  const cov = coverageTotals();

  const cv = complexity.totals || {};
  const dv = duplication.totals || {};

  const maintainabilityIndex =
    cv.avgMaintainabilityIndex != null ? cv.avgMaintainabilityIndex : 100;
  const avgComplexity = cv.avgFileComplexity != null ? cv.avgFileComplexity : 1;
  const dupPercent = dv.duplicatePercent != null ? dv.duplicatePercent : 0;

  // Weighted overall quality score.
  const components = {
    maintainability: { weight: 0.4, value: maintainabilityIndex },
    coverage: { weight: 0.3, value: cov.coveragePct },
    duplication: { weight: 0.2, value: Math.max(0, 100 - dupPercent) },
    complexity: { weight: 0.1, value: Math.max(0, 100 - Math.max(0, avgComplexity - 8) * 8) },
  };
  const overall = Number(
    Object.values(components)
      .reduce((s, c) => s + c.weight * c.value, 0)
      .toFixed(1)
  );

  const gates = {
    coveragePercent: Number(cov.coveragePct.toFixed(2)),
    coverageGate: cov.coveragePct >= (gate.coverage?.minPercent ?? 60),
    duplicatePercent: dupPercent,
    duplicationGate: dupPercent <= (gate.duplication?.maxPercent ?? 10),
    maintainabilityIndex,
    maintainabilityGate: maintainabilityIndex >= (gate.maintainability?.minIndex ?? 65),
    avgFunctionComplexity: avgComplexity,
    complexityGate: avgComplexity <= (gate.complexity?.maxAvgPerFunction ?? 8),
    highRiskFunctions: cv.highRiskFunctionsTotal ?? 0,
    highRiskGate: (cv.highRiskFunctionsTotal ?? 0) <= (gate.complexity?.maxHighRiskFunctions ?? 25),
    overall,
    overallGate: overall >= (gate.score?.minOverall ?? 70),
  };

  const passed = Object.entries(gates)
    .filter(([k]) => k.endsWith('Gate'))
    .every(([, v]) => v);

  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    passed,
    components,
    gates,
    coverage: { apps: cov.buckets, total: cov.coveragePct },
    reference: {
      complexityFile: 'reports/complexity.json',
      duplicationFile: 'reports/duplication.json',
    },
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'score.json'), JSON.stringify(report, null, 2));

  const md = [
    '## 🧭 Code Quality Score',
    '',
    `**Overall: ${overall}/100** — gate ${passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
    '| Dimension | Value | Gate |',
    '|---|---:|---|',
    `| Maintainability index | ${maintainabilityIndex} | ${gates.maintainabilityGate ? 'pass' : 'fail'} (min ${gate.maintainability?.minIndex ?? 65}) |`,
    `| Test coverage | ${gates.coveragePercent}% | ${gates.coverageGate ? 'pass' : 'fail'} (min ${gate.coverage?.minPercent ?? 60}%) |`,
    `| Duplication | ${dupPercent}% | ${gates.duplicationGate ? 'pass' : 'fail'} (max ${gate.duplication?.maxPercent ?? 10}%) |`,
    `| Avg function complexity | ${avgComplexity} | ${gates.complexityGate ? 'pass' : 'fail'} (max ${gate.complexity?.maxAvgPerFunction ?? 8}) |`,
    `| High-risk functions | ${gates.highRiskFunctions} | ${gates.highRiskGate ? 'pass' : 'fail'} (max ${gate.complexity?.maxHighRiskFunctions ?? 25}) |`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPORTS, 'score.md'), md);
  console.log(`score: ${overall}/100 (${passed ? 'PASSED' : 'FAILED'})`);
}

main();
