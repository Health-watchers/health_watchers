#!/usr/bin/env node
/**
 * Visual Regression Approval Workflow
 * =====================================
 * Manages the lifecycle of visual regression baselines:
 *
 *   Commands:
 *     approve          Approve pending visual diffs and promote them to baselines.
 *     reject           Reject/discard all pending diffs.
 *     list             List pending diffs that need review.
 *     status           Show overall diff statistics.
 *     clean            Remove stale snapshot directories for deleted test files.
 *
 *   Flags:
 *     --project <name>  Filter by project name (e.g. chromium-desktop-dark).
 *     --test <pattern>  Filter by test name substring (e.g. "dashboard").
 *     --dry-run         Preview actions without writing to disk.
 *     --all             Approve/reject all pending diffs without prompting.
 *
 *   Usage:
 *     node scripts/visual-approve.mjs approve
 *     node scripts/visual-approve.mjs approve --project chromium-desktop
 *     node scripts/visual-approve.mjs approve --test "login page" --dry-run
 *     node scripts/visual-approve.mjs list
 *     node scripts/visual-approve.mjs status
 *
 *   Typical PR workflow:
 *     1. CI captures diffs and uploads `playwright-visual-report/` as an artefact.
 *     2. Reviewer inspects diffs in the HTML report or by downloading the artefact.
 *     3. If changes are intentional, run:
 *          npx playwright test --config=playwright.visual.config.ts --update-snapshots
 *        Or use this script in a local environment:
 *          node scripts/visual-approve.mjs approve
 *     4. Commit the updated snapshot files and push.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(WEB_DIR, 'e2e', 'snapshots');
const REPORT_DIR = path.join(WEB_DIR, 'playwright-visual-report');
const RESULTS_JSON = path.join(REPORT_DIR, 'results.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively find all files with a given extension under a directory. */
function findFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full, ext));
    else if (entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}

/** Load the Playwright JSON results file (may not exist if tests haven't run yet). */
function loadResults() {
  if (!fs.existsSync(RESULTS_JSON)) return null;
  try {
    return JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
  } catch {
    return null;
  }
}

/** Extract all failed screenshot tests from Playwright results. */
function getFailedScreenshotTests(results) {
  if (!results?.suites) return [];
  const failed = [];

  function walk(suite, projectName = '') {
    const project = suite.project ?? projectName;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'failed' || test.status === 'unexpected') {
          for (const result of test.results ?? []) {
            for (const attachment of result.attachments ?? []) {
              if (attachment.name?.includes('-diff') || attachment.name?.includes('screenshot')) {
                failed.push({
                  title: spec.title,
                  project,
                  diffPath: attachment.path,
                  status: test.status,
                });
              }
            }
          }
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, project);
  }
  walk(results);
  return failed;
}

/** Parse command-line arguments into an options object. */
function parseArgs(argv) {
  const opts = {
    command: argv[2] ?? 'list',
    project: null,
    test: null,
    dryRun: false,
    all: false,
  };
  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) opts.project = argv[++i];
    else if (argv[i] === '--test' && argv[i + 1]) opts.test = argv[++i];
    else if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--all') opts.all = true;
  }
  return opts;
}

/** Interactive confirmation prompt. */
async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** list — show all snapshot files alongside their diff counterparts. */
function cmdList(opts) {
  const snapshots = findFiles(SNAPSHOTS_DIR, '.png').filter(
    (f) => !f.includes('-diff.') && !f.includes('-actual.'),
  );

  if (snapshots.length === 0) {
    console.log('📷  No baseline snapshots found yet.');
    console.log(`    Run: npx playwright test --config=playwright.visual.config.ts --update-snapshots`);
    return;
  }

  // Find corresponding diff files in the report directory
  const diffs = findFiles(REPORT_DIR, '-diff.png');

  console.log(`\n📸 Baseline snapshots: ${snapshots.length}`);
  console.log(`❌ Pending diffs:      ${diffs.length}`);

  if (diffs.length === 0) {
    console.log('\n✅ No pending diffs. All snapshots match their baselines.\n');
    return;
  }

  console.log('\nPending diffs:');
  for (const diff of diffs) {
    const rel = path.relative(WEB_DIR, diff);
    const filtered =
      (opts.project && !rel.includes(opts.project)) ||
      (opts.test && !rel.toLowerCase().includes(opts.test.toLowerCase()));
    if (!filtered) {
      console.log(`  - ${rel}`);
    }
  }
  console.log();
}

/** status — show summary statistics from the last test run. */
function cmdStatus() {
  const results = loadResults();

  if (!results) {
    console.log('⚠️  No test results found. Run the visual regression suite first:');
    console.log('    npx playwright test --config=playwright.visual.config.ts');
    return;
  }

  // Count totals
  let passed = 0, failed = 0, skipped = 0;
  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status === 'passed' || test.status === 'expected') passed++;
        else if (test.status === 'failed' || test.status === 'unexpected') failed++;
        else skipped++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  walk(results);

  console.log('\n📊 Visual Regression Status');
  console.log('────────────────────────────');
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  📸 Total:   ${passed + failed + skipped}`);

  if (failed > 0) {
    console.log('\n💡 To review diffs, open the HTML report:');
    console.log(`    npx playwright show-report ${REPORT_DIR}`);
    console.log('\n💡 To approve all changes and update baselines:');
    console.log('    node scripts/visual-approve.mjs approve --all');
    console.log('\n💡 To regenerate all baselines from scratch:');
    console.log('    npx playwright test --config=playwright.visual.config.ts --update-snapshots');
  }
  console.log();
}

/** approve — update baselines with Playwright's --update-snapshots flag. */
async function cmdApprove(opts) {
  console.log('\n🔍 Visual Regression Approval Workflow');
  console.log('────────────────────────────────────────');

  if (opts.dryRun) {
    console.log('🔸 Dry-run mode: no changes will be written.\n');
  }

  // Build playwright command
  const playwrightArgs = ['npx', 'playwright', 'test',
    '--config=playwright.visual.config.ts',
    '--update-snapshots',
  ];

  if (opts.project) {
    playwrightArgs.push(`--project=${opts.project}`);
    console.log(`📌 Scoped to project: ${opts.project}`);
  }

  if (opts.test) {
    playwrightArgs.push(`--grep=${JSON.stringify(opts.test)}`);
    console.log(`📌 Scoped to test:    ${opts.test}`);
  }

  console.log('\n⚠️  This will overwrite existing baseline snapshots with the current output.');
  console.log('    Only proceed if you have reviewed the diffs and confirmed the changes are intentional.\n');

  if (!opts.all) {
    const ok = await confirm('Proceed with updating baselines?');
    if (!ok) {
      console.log('❌ Aborted.\n');
      process.exit(0);
    }
  }

  if (opts.dryRun) {
    console.log(`\n🔸 Would run: ${playwrightArgs.join(' ')}\n`);
    return;
  }

  console.log(`\n🚀 Running: ${playwrightArgs.join(' ')}\n`);

  try {
    execSync(playwrightArgs.join(' '), {
      stdio: 'inherit',
      cwd: WEB_DIR,
      env: { ...process.env },
    });
    console.log('\n✅ Baselines updated successfully.');
    console.log('   Please review the changed snapshot files (git diff --stat) before committing.\n');
  } catch {
    console.error('\n❌ Playwright exited with errors. Check the output above.\n');
    process.exit(1);
  }
}

/** reject — discard pending diffs without updating baselines. */
function cmdReject(opts) {
  const diffFiles = findFiles(REPORT_DIR, '-diff.png');
  const actualFiles = findFiles(REPORT_DIR, '-actual.png');
  const allFiles = [...diffFiles, ...actualFiles];

  const toRemove = allFiles.filter((f) => {
    const rel = path.relative(WEB_DIR, f);
    if (opts.project && !rel.includes(opts.project)) return false;
    if (opts.test && !rel.toLowerCase().includes(opts.test.toLowerCase())) return false;
    return true;
  });

  if (toRemove.length === 0) {
    console.log('✅ Nothing to reject.\n');
    return;
  }

  console.log(`\n🗑  Rejecting ${toRemove.length} diff file(s):\n`);
  for (const f of toRemove) {
    console.log(`  - ${path.relative(WEB_DIR, f)}`);
    if (!opts.dryRun) fs.unlinkSync(f);
  }

  console.log(opts.dryRun ? '\n🔸 Dry-run: no files removed.\n' : '\n✅ Diffs rejected.\n');
}

/** clean — remove snapshot directories for test files that no longer exist. */
function cmdClean(opts) {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    console.log('📂 No snapshots directory found.\n');
    return;
  }

  const allProjects = fs.readdirSync(SNAPSHOTS_DIR).filter((d) =>
    fs.statSync(path.join(SNAPSHOTS_DIR, d)).isDirectory(),
  );

  let removed = 0;
  for (const project of allProjects) {
    const projectDir = path.join(SNAPSHOTS_DIR, project);
    const testDirs = fs.readdirSync(projectDir).filter((d) =>
      fs.statSync(path.join(projectDir, d)).isDirectory(),
    );

    for (const testDir of testDirs) {
      const specFile = path.join(WEB_DIR, 'e2e', 'visual', testDir);
      if (!fs.existsSync(specFile)) {
        const staleDir = path.join(projectDir, testDir);
        console.log(`🗑  Removing stale snapshot dir: ${path.relative(WEB_DIR, staleDir)}`);
        if (!opts.dryRun) fs.rmSync(staleDir, { recursive: true });
        removed++;
      }
    }
  }

  if (removed === 0) console.log('✅ No stale snapshot directories found.\n');
  else if (opts.dryRun) console.log(`\n🔸 Dry-run: would remove ${removed} director(ies).\n`);
  else console.log(`\n✅ Removed ${removed} stale director(ies).\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv);

switch (opts.command) {
  case 'list':    cmdList(opts);                break;
  case 'status':  cmdStatus();                  break;
  case 'approve': await cmdApprove(opts);       break;
  case 'reject':  cmdReject(opts);              break;
  case 'clean':   cmdClean(opts);               break;
  default:
    console.error(`Unknown command: ${opts.command}`);
    console.error('Valid commands: approve | reject | list | status | clean');
    process.exit(1);
}
