#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const args = process.argv.slice(2);
function argValue(name, fallback = '') {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
}

const BASE_URL = (argValue('base-url', process.env.SMOKE_API_URL) || config.api.baseUrl).replace(
  /\/$/,
  ''
);
const EMAIL = argValue(
  'email',
  process.env.SMOKE_DOCTOR_EMAIL || config.credentials.defaults.email
);
const PASSWORD = argValue(
  'password',
  process.env.SMOKE_DOCTOR_PASSWORD || config.credentials.defaults.password
);
const RETRIES = Number(argValue('retries', process.env.SMOKE_RETRIES || String(config.retries)));
const BUDGET_MS = Number(
  argValue('budget-ms', process.env.SMOKE_BUDGET_MS || String(config.budgetSeconds * 1000))
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bodyFor(check) {
  if (check.body === 'login') return JSON.stringify({ email: EMAIL, password: PASSWORD });
  return check.body ? JSON.stringify(check.body) : undefined;
}

async function attempt(check, accessToken) {
  const headers = { 'Content-Type': 'application/json' };
  const body = bodyFor(check);
  if (body) headers['Content-Length'] = Buffer.byteLength(body);
  if (check.authenticated) headers.Authorization = `Bearer ${accessToken}`;

  const started = Date.now();
  const res = await fetch(`${BASE_URL}${check.path}`, {
    method: check.method,
    headers,
    body,
  });
  const duration = Date.now() - started;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const statusOk = res.status === check.expectStatus;
  const slow = duration > check.maxDurationMs;
  const extracted =
    check.saveTokenFrom && json && json.data && json.data[check.saveTokenFrom]
      ? json.data[check.saveTokenFrom]
      : null;

  return { status: res.status, duration, statusOk, slow, extracted, body: text.slice(0, 500) };
}

async function runCheck(check, accessToken) {
  const failures = [];
  let last = null;
  for (let attemptIndex = 0; attemptIndex <= RETRIES; attemptIndex += 1) {
    last = await attempt(check, accessToken);
    if (last.statusOk && !last.slow) {
      return { ...last, attempt: attemptIndex + 1, passed: true, failures: [] };
    }
    if (!last.statusOk || last.slow) {
      failures.push({
        attempt: attemptIndex + 1,
        status: last.status,
        duration: last.duration,
        ok: last.statusOk,
        slow: last.slow,
      });
    }
    if (attemptIndex < RETRIES) await sleep(config.retryDelayMs * (attemptIndex + 1));
  }
  return { ...last, attempt: RETRIES + 1, passed: false, failures };
}

async function main() {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const results = [];
  let accessToken = '';
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const check of config.api.checks) {
    if (!accessToken && check.authenticated) {
      results.push({
        name: check.name,
        passed: false,
        skipped: true,
        reason: 'no access token available',
        duration: 0,
      });
      skipped += 1;
      continue;
    }
    const result = await runCheck(check, accessToken);
    if (result.passed && result.extracted) accessToken = result.extracted;
    result.skipped = false;
    result.critical = check.critical;
    result.checkName = check.name;
    results.push(result);
    if (result.passed) passed += 1;
    else if (check.critical) failed += 1;
    else skipped += 1;
  }

  const totalMs = Date.now() - start;
  const withinBudget = totalMs <= BUDGET_MS;
  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    total: results.length,
    passed,
    failed,
    skipped,
    nonCriticalWarnings: results.filter((r) => !r.passed && !r.critical).length,
    durationMs: totalMs,
    budgetMs: BUDGET_MS,
    withinBudget,
    results,
  };

  const reportDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'api-smoke-results.json'),
    JSON.stringify(summary, null, 2)
  );

  const reasons = results
    .filter((r) => !r.passed)
    .map((r) => `${r.checkName} (${r.reason || `status ${r.status}`})`);
  console.log(
    `\nSmoke results: ${passed} passed, ${failed} failed, ${skipped} skipped (${totalMs}ms, budget ${BUDGET_MS}ms)`
  );
  if (reasons.length) console.log(`Non-passing: ${reasons.join(', ')}`);
  if (!withinBudget) {
    console.error(`SMOKE BUDGET EXCEEDED: ${totalMs}ms > ${BUDGET_MS}ms`);
  }

  const failedCritical = failed > 0;
  if (failedCritical || !withinBudget) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Smoke runner crashed:', err);
  process.exitCode = 1;
});
