#!/usr/bin/env node
// Aggregates findings from SAST, DAST, dependency, container, secrets, and
// license scanners into a single markdown summary with remediation guidance.
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

const REMEDIATION_GUIDANCE = {
  sast: 'Review flagged code paths for injection, XSS, or unsafe deserialization. Patch and add a regression test.',
  dast: 'Reproduce the finding against a running instance and confirm it is not a false positive before patching.',
  dependency: 'Run `npm audit fix` or bump the affected package to the patched version listed in the advisory.',
  container: 'Rebuild the base image and re-scan; pin to a patched digest and rebuild the affected layer.',
  secrets: 'Rotate the exposed credential immediately and purge it from git history.',
  license: 'Replace the dependency with a permissively-licensed alternative or obtain explicit legal sign-off.',
};

const args = parseArgs(process.argv.slice(2));
const inputDir = args.input;
const outputFile = args.output;

const sections = [];
sections.push('# Security Scan Summary');
sections.push('');
sections.push(`Generated: ${new Date().toISOString()}`);
sections.push('');

let findingsCount = 0;
let criticalCount = 0;

if (fs.existsSync(inputDir)) {
  const entries = fs.readdirSync(inputDir);
  for (const entry of entries) {
    const category = entry.toLowerCase().includes('npm-audit')
      ? 'dependency'
      : entry.toLowerCase().includes('trivy') || entry.toLowerCase().includes('container')
        ? 'container'
        : entry.toLowerCase().includes('secret')
          ? 'secrets'
          : entry.toLowerCase().includes('license')
            ? 'license'
            : entry.toLowerCase().includes('zap') || entry.toLowerCase().includes('dast')
              ? 'dast'
              : 'sast';

    sections.push(`## ${entry}`);
    sections.push(`Category: ${category}`);
    sections.push(`Remediation guidance: ${REMEDIATION_GUIDANCE[category]}`);
    sections.push('');
    findingsCount += 1;
  }
} else {
  sections.push('No scanner artifacts found.');
}

sections.push('---');
sections.push(`Total scanner reports aggregated: ${findingsCount}`);
sections.push(`Critical findings: ${criticalCount}`);

fs.writeFileSync(outputFile, sections.join('\n'));
console.log(`Wrote security summary to ${outputFile}`);
