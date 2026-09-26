#!/usr/bin/env ts-node
/**
 * Audit Script for Secrets Scanning
 *
 * This script helps identify potential secrets in the repository using gitleaks.
 * It provides multiple scanning modes and generates reports.
 *
 * Usage:
 *   npm run audit:secrets -- [--mode=full|staged|commits] [--format=json|sarif|text]
 *
 * Modes:
 *   full    - Scan entire repository (default)
 *   staged  - Scan only staged changes
 *   commits - Scan since origin/main..HEAD
 *
 * Formats:
 *   text   - Human-readable output (default)
 *   json   - JSON report
 *   sarif  - SARIF format for GitHub Security tab
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

interface Options {
  mode: 'full' | 'staged' | 'commits';
  format: 'json' | 'sarif' | 'text';
  output?: string;
  verbose: boolean;
}

interface LeakReport {
  totalLeaks: number;
  byFile: Record<string, number>;
  leaks: Array<{
    file: string;
    rule: string;
    line: number;
    match: string;
  }>;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    mode: 'full',
    format: 'text',
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      options.mode = arg.split('=')[1] as 'full' | 'staged' | 'commits';
    } else if (arg.startsWith('--format=')) {
      options.format = arg.split('=')[1] as 'json' | 'sarif' | 'text';
    } else if (arg.startsWith('--output=')) {
      options.output = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

function buildGitleaksCommand(mode: string): string {
  const baseCommand = [
    'docker run --rm',
    '-v $(pwd):/repo',
    'zricethezav/gitleaks:latest detect',
    '--source=/repo',
    '--config=/repo/.gitleaks.toml',
  ];

  if (mode === 'staged') {
    baseCommand.push('--log-opts=--diff-filter=d HEAD');
  } else if (mode === 'commits') {
    baseCommand.push('--log-opts=origin/main..HEAD');
  }

  return baseCommand.join(' ');
}

function runScan(options: Options): LeakReport {
  try {
    const reportPath = '/tmp/gitleaks-report-temp.json';
    const command = `${buildGitleaksCommand(options.mode)} --report-format=json --report-path=${reportPath}`;

    if (options.verbose) {
      console.log(`Running: ${command}\n`);
    }

    execSync(command, { stdio: 'inherit' });

    // Read the report
    if (!existsSync(reportPath)) {
      return { totalLeaks: 0, byFile: {}, leaks: [] };
    }

    const reportData = JSON.parse(readFileSync(reportPath, 'utf-8'));
    const byFile: Record<string, number> = {};
    const leaks: LeakReport['leaks'] = [];

    for (const leak of reportData) {
      byFile[leak.File] = (byFile[leak.File] || 0) + 1;
      leaks.push({
        file: leak.File,
        rule: leak.RuleID || 'unknown',
        line: leak.StartLine,
        match: leak.Match,
      });
    }

    return {
      totalLeaks: reportData.length,
      byFile,
      leaks,
    };
  } catch (error) {
    console.error(`Scan failed: ${(error as Error).message}`);
    return { totalLeaks: 0, byFile: {}, leaks: [] };
  }
}

function formatReport(report: LeakReport, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(report, null, 2);

    case 'text':
      let output = `\n${'='.repeat(60)}\n`;
      output += `Secrets Audit Report\n`;
      output += `${'='.repeat(60)}\n\n`;
      output += `Total Leaks Found: ${report.totalLeaks}\n\n`;

      if (report.totalLeaks === 0) {
        output += '✅ No secrets detected!\n';
        return output;
      }

      output += `Leaks by File:\n`;
      output += `${'-'.repeat(40)}\n`;
      for (const [file, count] of Object.entries(report.byFile)) {
        output += `  ${file}: ${count} leak(s)\n`;
      }
      output += `\n`;

      output += `Detailed Leaks:\n`;
      output += `${'-'.repeat(40)}\n`;
      for (const leak of report.leaks) {
        output += `  📄 ${leak.file}:${leak.line}\n`;
        output += `     Rule: ${leak.rule}\n`;
        output += `     Match: ${leak.match}\n\n`;
      }

      output += `${'='.repeat(60)}\n`;
      output += `Recommendations:\n`;
      output += `${'='.repeat(60)}\n`;
      output += `1. Review the leaks above carefully\n`;
      output += `2. Rotate any real secrets immediately\n`;
      output += `3. For false positives, update .gitleaks.toml\n`;
      output += `4. See SECURITY_SECRETS_REMEDIATION.md for guidance\n\n`;

      return output;

    case 'sarif':
      return JSON.stringify(
        {
          version: '2.1.0',
          runs: [
            {
              tool: {
                driver: {
                  name: 'Gitleaks',
                  version: '8.0',
                  informationUri: 'https://github.com/gitleaks/gitleaks',
                },
              },
              results: report.leaks.map((leak) => ({
                level: 'warning',
                message: {
                  text: `Potential secret detected: ${leak.rule}`,
                },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: {
                        uri: leak.file,
                      },
                      region: {
                        startLine: leak.line,
                      },
                    },
                  },
                ],
              })),
            },
          ],
        },
        null,
        2
      );

    default:
      return JSON.stringify(report, null, 2);
  }
}

async function main() {
  const options = parseArgs();

  console.log(`🔍 Starting secrets audit in ${options.mode} mode...\n`);

  const report = runScan(options);
  const formatted = formatReport(report, options.format);

  if (options.output) {
    writeFileSync(options.output, formatted);
    console.log(`\n📄 Report saved to: ${options.output}`);
  } else {
    console.log(formatted);
  }

  process.exit(report.totalLeaks > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
