#!/usr/bin/env node
/**
 * Turns a `snyk test --json` report into a concise Markdown summary suitable
 * for posting as a PR comment. Used by .github/workflows/dependabot-security.yml.
 *
 * Usage: node snyk-summary.js <path-to-snyk-report.json>
 */
'use strict';

const fs = require('fs');

const path = process.argv[2];
if (!path) {
  console.log('No Snyk report path provided.');
  process.exit(0);
}

let raw;
try {
  raw = fs.readFileSync(path, 'utf8');
} catch {
  console.log('Snyk report file not found.');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.log('Snyk report was not valid JSON (scan may have failed or token missing).');
  process.exit(0);
}

// `snyk test --json` can return either a single project object or an array of them.
const projects = Array.isArray(report) ? report : [report];

const order = { critical: 0, high: 1, medium: 2, low: 3 };
const counts = { critical: 0, high: 0, medium: 0, low: 0 };
const vulns = [];

for (const project of projects) {
  for (const v of project.vulnerabilities || []) {
    const sev = (v.severity || 'low').toLowerCase();
    if (counts[sev] !== undefined) counts[sev] += 1;
    vulns.push({
      severity: sev,
      title: v.title || 'Unknown issue',
      pkg: v.packageName || v.moduleName || 'unknown',
      version: v.version || '',
      id: v.id || '',
      fixedIn: Array.isArray(v.fixedIn) && v.fixedIn.length ? v.fixedIn.join(', ') : 'no fix available',
    });
  }
}

const total = vulns.length;

if (total === 0) {
  console.log('✅ **No known vulnerabilities found** in the updated dependency tree.');
  process.exit(0);
}

// De-duplicate by vulnerability id and sort by severity.
const seen = new Set();
const unique = vulns
  .filter((v) => {
    const key = `${v.id}|${v.pkg}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

const lines = [];
lines.push(
  `**${total}** issue(s) found — ` +
    `🔴 ${counts.critical} critical, 🟠 ${counts.high} high, 🟡 ${counts.medium} medium, ⚪ ${counts.low} low.`
);
if (counts.critical > 0) {
  lines.push('');
  lines.push('> ⛔ **Critical vulnerabilities present — this PR is blocked from merging.**');
}
lines.push('');
lines.push('| Severity | Package | Issue | Fixed in |');
lines.push('| --- | --- | --- | --- |');
const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
for (const v of unique.slice(0, 25)) {
  const title = v.title.replace(/\|/g, '\\|');
  lines.push(`| ${emoji[v.severity]} ${v.severity} | \`${v.pkg}@${v.version}\` | ${title} | ${v.fixedIn} |`);
}
if (unique.length > 25) {
  lines.push('');
  lines.push(`_…and ${unique.length - 25} more. See the uploaded \`snyk-report.html\` artifact for the full report._`);
}

console.log(lines.join('\n'));
