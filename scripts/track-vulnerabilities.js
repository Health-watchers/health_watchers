#!/usr/bin/env node
/**
 * Vulnerability Tracking System
 * Issue #1051 - Dependency Vulnerability Scanning
 *
 * Tracks and manages dependency vulnerabilities across scan cycles
 */

const fs = require('fs');
const path = require('path');

const TRACKING_FILE = path.join(__dirname, '../security-reports/vulnerability-tracking.json');
const REPORTS_DIR = path.join(__dirname, '../security-reports/dependency-scans');

// Ensure directories exist
function ensureDirectories() {
  const dir = path.dirname(TRACKING_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

// Load existing tracking data
function loadTrackingData() {
  if (fs.existsSync(TRACKING_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
  }
  return {
    lastScan: null,
    vulnerabilities: {},
    history: [],
  };
}

// Save tracking data
function saveTrackingData(data) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
}

// Parse audit report
function parseAuditReport(reportPath) {
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(reportPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to parse ${reportPath}:`, error.message);
    return null;
  }
}

// Get latest reports
function getLatestReports() {
  if (!fs.existsSync(REPORTS_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith('npm-audit-') && f.endsWith('.json'))
    .map((f) => ({
      name: f,
      path: path.join(REPORTS_DIR, f),
      time: fs.statSync(path.join(REPORTS_DIR, f)).mtime,
    }))
    .sort((a, b) => b.time - a.time);

  // Group by workspace and get latest for each
  const latest = {};
  for (const file of files) {
    const workspace = file.name.replace('npm-audit-', '').replace(/-\d{8}_\d{6}\.json$/, '');
    if (!latest[workspace]) {
      latest[workspace] = file;
    }
  }

  return Object.values(latest);
}

// Update tracking with new scan results
function updateTracking() {
  ensureDirectories();

  const tracking = loadTrackingData();
  const reports = getLatestReports();

  if (reports.length === 0) {
    console.log('No audit reports found. Run scan-dependencies.sh first.');
    return;
  }

  const scanDate = new Date().toISOString();
  const scanSummary = {
    date: scanDate,
    workspaces: {},
    totals: {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
    },
  };

  // Process each report
  for (const report of reports) {
    const data = parseAuditReport(report.path);
    if (!data) continue;

    const workspace = report.name.replace('npm-audit-', '').replace(/-\d{8}_\d{6}\.json$/, '');
    const vulns = data.metadata?.vulnerabilities || {};

    scanSummary.workspaces[workspace] = vulns;

    // Aggregate totals
    scanSummary.totals.critical += vulns.critical || 0;
    scanSummary.totals.high += vulns.high || 0;
    scanSummary.totals.moderate += vulns.moderate || 0;
    scanSummary.totals.low += vulns.low || 0;
    scanSummary.totals.info += vulns.info || 0;

    // Track individual vulnerabilities
    if (data.vulnerabilities) {
      for (const [name, details] of Object.entries(data.vulnerabilities)) {
        const vulnKey = `${workspace}:${name}:${details.via?.[0]?.title || 'unknown'}`;

        if (!tracking.vulnerabilities[vulnKey]) {
          tracking.vulnerabilities[vulnKey] = {
            package: name,
            workspace,
            severity: details.severity,
            firstDetected: scanDate,
            lastSeen: scanDate,
            status: 'open',
            fixAvailable: details.fixAvailable || false,
          };
        } else {
          tracking.vulnerabilities[vulnKey].lastSeen = scanDate;
          tracking.vulnerabilities[vulnKey].fixAvailable = details.fixAvailable || false;
        }
      }
    }
  }

  // Mark vulnerabilities as resolved if not seen in latest scan
  for (const [key, vuln] of Object.entries(tracking.vulnerabilities)) {
    if (vuln.lastSeen !== scanDate && vuln.status === 'open') {
      vuln.status = 'resolved';
      vuln.resolvedDate = scanDate;
    }
  }

  // Update tracking data
  tracking.lastScan = scanDate;
  tracking.history.push(scanSummary);

  // Keep only last 30 scans in history
  if (tracking.history.length > 30) {
    tracking.history = tracking.history.slice(-30);
  }

  saveTrackingData(tracking);

  // Print summary
  console.log('\n=== Vulnerability Tracking Updated ===\n');
  console.log(`Scan Date: ${scanDate}`);
  console.log(`\nTotals:`);
  console.log(`  Critical: ${scanSummary.totals.critical}`);
  console.log(`  High:     ${scanSummary.totals.high}`);
  console.log(`  Moderate: ${scanSummary.totals.moderate}`);
  console.log(`  Low:      ${scanSummary.totals.low}`);

  const openVulns = Object.values(tracking.vulnerabilities).filter((v) => v.status === 'open');
  const resolvedVulns = Object.values(tracking.vulnerabilities).filter(
    (v) => v.status === 'resolved'
  );

  console.log(`\nTracked Vulnerabilities:`);
  console.log(`  Open:     ${openVulns.length}`);
  console.log(`  Resolved: ${resolvedVulns.length}`);
  console.log(`\nTracking file: ${TRACKING_FILE}`);
}

// Generate report
function generateReport() {
  const tracking = loadTrackingData();

  if (!tracking.lastScan) {
    console.log('No tracking data available. Run update-tracking first.');
    return;
  }

  console.log('\n=== Vulnerability Status Report ===\n');
  console.log(`Last Scan: ${tracking.lastScan}\n`);

  const openVulns = Object.values(tracking.vulnerabilities).filter((v) => v.status === 'open');
  const bySeverity = {
    critical: openVulns.filter((v) => v.severity === 'critical'),
    high: openVulns.filter((v) => v.severity === 'high'),
    moderate: openVulns.filter((v) => v.severity === 'moderate'),
    low: openVulns.filter((v) => v.severity === 'low'),
  };

  console.log(`Open Vulnerabilities: ${openVulns.length}\n`);

  for (const [severity, vulns] of Object.entries(bySeverity)) {
    if (vulns.length === 0) continue;

    console.log(`${severity.toUpperCase()}: ${vulns.length}`);
    for (const vuln of vulns) {
      console.log(`  - ${vuln.package} (${vuln.workspace})`);
      console.log(`    First detected: ${vuln.firstDetected}`);
      console.log(`    Fix available: ${vuln.fixAvailable ? 'Yes' : 'No'}`);
    }
    console.log('');
  }

  if (tracking.history.length > 1) {
    console.log('=== Trend (Last 5 Scans) ===\n');
    const recent = tracking.history.slice(-5);
    for (const scan of recent) {
      const date = new Date(scan.date).toLocaleDateString();
      console.log(
        `${date}: Critical: ${scan.totals.critical}, High: ${scan.totals.high}, Moderate: ${scan.totals.moderate}`
      );
    }
  }
}

// CLI
const command = process.argv[2];

switch (command) {
  case 'update':
    updateTracking();
    break;
  case 'report':
    generateReport();
    break;
  default:
    console.log('Usage:');
    console.log('  node track-vulnerabilities.js update  - Update tracking from latest scans');
    console.log('  node track-vulnerabilities.js report  - Generate status report');
    process.exit(1);
}
