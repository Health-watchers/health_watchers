#!/usr/bin/env node
/**
 * Builds the weekly dependency audit report (Markdown) from the JSON outputs of
 * `npm audit`, `npm outdated`, and `license-checker`.
 * Used by .github/workflows/dependency-report.yml.
 */
'use strict';

const fs = require('fs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const audit = readJson('audit.json');
const outdated = readJson('outdated.json') || {};
const licenses = readJson('licenses.json') || {};

const out = [];
const today = new Date().toISOString().slice(0, 10);
out.push(`# 📦 Dependency Audit Report — ${today}`);
out.push('');
out.push('_Generated automatically by the Weekly Dependency Audit Report workflow._');
out.push('');

// ── Vulnerabilities ─────────────────────────────────────────────────────────
out.push('## 🔒 Vulnerabilities (`npm audit`)');
out.push('');
const vuln = audit && audit.metadata && audit.metadata.vulnerabilities;
if (vuln) {
  const { critical = 0, high = 0, moderate = 0, low = 0, info = 0 } = vuln;
  const total = critical + high + moderate + low + info;
  if (total === 0) {
    out.push('✅ No known vulnerabilities.');
  } else {
    out.push('| Severity | Count |');
    out.push('| --- | --- |');
    out.push(`| 🔴 Critical | ${critical} |`);
    out.push(`| 🟠 High | ${high} |`);
    out.push(`| 🟡 Moderate | ${moderate} |`);
    out.push(`| ⚪ Low | ${low} |`);
    out.push(`| ℹ️ Info | ${info} |`);
    if (critical > 0) {
      out.push('');
      out.push('> ⛔ **Critical vulnerabilities present — these block PR merges and must be remediated.**');
    }
  }
} else {
  out.push('_Audit data unavailable._');
}
out.push('');

// ── Outdated packages ───────────────────────────────────────────────────────
out.push('## ⏫ Outdated Packages (`npm outdated`)');
out.push('');
const outdatedNames = Object.keys(outdated);
if (outdatedNames.length === 0) {
  out.push('✅ All dependencies are up to date.');
} else {
  out.push('| Package | Current | Wanted | Latest |');
  out.push('| --- | --- | --- | --- |');
  for (const name of outdatedNames.sort().slice(0, 50)) {
    const info = outdated[name] || {};
    out.push(`| \`${name}\` | ${info.current || '-'} | ${info.wanted || '-'} | ${info.latest || '-'} |`);
  }
  if (outdatedNames.length > 50) {
    out.push('');
    out.push(`_…and ${outdatedNames.length - 50} more._`);
  }
}
out.push('');

// ── License breakdown ───────────────────────────────────────────────────────
out.push('## 📄 Production License Breakdown');
out.push('');
const licenseCounts = {};
for (const pkg of Object.keys(licenses)) {
  const lic = (licenses[pkg] && licenses[pkg].licenses) || 'UNKNOWN';
  const key = Array.isArray(lic) ? lic.join('/') : String(lic);
  licenseCounts[key] = (licenseCounts[key] || 0) + 1;
}
const licenseKeys = Object.keys(licenseCounts);
if (licenseKeys.length === 0) {
  out.push('_License data unavailable._');
} else {
  out.push('| License | Packages |');
  out.push('| --- | --- |');
  for (const key of licenseKeys.sort((a, b) => licenseCounts[b] - licenseCounts[a])) {
    out.push(`| ${key} | ${licenseCounts[key]} |`);
  }
}
out.push('');
out.push('---');
out.push('See `CONTRIBUTING.md` → _Dependency Update Guidelines_ for the remediation process.');

console.log(out.join('\n'));
