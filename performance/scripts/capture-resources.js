#!/usr/bin/env node
'use strict';

// Samples CPU and memory used by the API while a benchmark runs, so reports
// can tell latency stories apart from resource saturation (issue #1319 —
// "resource utilization monitoring").
//
// Usage:
//   node performance/scripts/capture-resources.js \
//     --duration 60 --interval 3 --label api-1
//
// Tries, in order:
//   1. a named Docker container (--container health-watchers-api)
//   2. the node process whose `--inspect|dev|serve` cmdline matches --match
//   3. the current process only (fallback warnings)
//
// Writes performance/results/resources.json.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : fallback;
}

const DURATION_MS = Number(arg('duration', '0')) * 1000 || 90_000;
const INTERVAL_MS = (Number(arg('interval', '0')) || 3) * 1000;
const CONTAINER = arg('container', '');
const MATCH = arg('match', 'health-watchers');
const LABEL = arg('label', 'api');

function dockerStats() {
  if (!CONTAINER) return null;
  try {
    const out = execFileSync(
      'docker',
      ['stats', '--no-stream', '--format', '{{json .}}', CONTAINER],
      {
        encoding: 'utf8',
      }
    );
    const line = out.split('\n').find((l) => l.trim().length);
    const json = JSON.parse(line.trim());
    const parse = (v) => parseFloat(String(v).replace(/[^\d.]/g, ''));
    const memTotal = parse(json.MemUsage.split('/')[1] || '0') || 0;
    return {
      source: 'docker',
      cpuPct: parse(json.CPUPerc),
      memPct: parse(json.MemPerc),
      memBytes: parse(json.MemUsage.split('/')[0] || '0'),
      memLimitBytes: memTotal,
    };
  } catch {
    return null;
  }
}

function procStats() {
  try {
    const pids = String(execFileSync('pgrep', ['-f', MATCH], { encoding: 'utf8' }))
      .split('\n')
      .filter(Boolean);
    let best = null;
    for (const pid of pids) {
      try {
        const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        if (comm !== 'node' && comm !== 'nodejs') continue;
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ');
        const statusText = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
        const utime = Number(stat[14]);
        const stime = Number(stat[15]);
        const rssKB = Number((statusText.match(/^VmRSS:\s+(\d+)\s+kB/m) || [])[1] || 0);
        if (!best || rssKB > best.rssKB) {
          best = { pid, utime, stime, rssKB };
        }
      } catch {}
    }
    if (!best) return null;
    if (!PROC.last)
      PROC.last = { pid: best.pid, utime: best.utime, stime: best.stime, at: Date.now() };
    const last = PROC.last;
    const dt = Date.now() - last.at;
    const cpuPct =
      dt > 0
        ? (((best.utime + best.stime - last.utime - last.stime) / os.cpus().length) * 10000) / dt
        : 0;
    PROC.last = { pid: best.pid, utime: best.utime, stime: best.stime, at: Date.now() };
    return { source: 'proc', pid: best.pid, cpuPct, memBytes: best.rssKB * 1024 };
  } catch {
    return null;
  }
}

const PROC = { last: null };

function sample() {
  const docker = dockerStats();
  if (docker) return docker;
  const proc = procStats();
  if (proc) return proc;
  return {
    source: 'none',
    cpuPct: 0,
    memBytes: 0,
    note: 'no api process/container found — is the API running?',
  };
}

function main() {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const samples = [];
  while (Date.now() - start < DURATION_MS) {
    const s = sample();
    s.t = new Date().toISOString();
    s.elapsedMs = Date.now() - start;
    samples.push(s);
    const remaining = DURATION_MS - (Date.now() - start);
    if (remaining <= 0) break;
    const wait = Math.min(INTERVAL_MS, remaining);
    // Synchronous-ish wait via busy-free sleep
    spawnSync('sleep', [String(wait / 1000)]);
  }

  const last = samples[samples.length - 1] || {};
  const summary = {
    label: LABEL,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    intervalMs: INTERVAL_MS,
    sampleCount: samples.length,
    source: last.source || 'none',
    maxCpuPct: samples.reduce((m, s) => Math.max(m, s.cpuPct || 0), 0),
    avgCpuPct: samples.length
      ? samples.reduce((m, s) => m + (s.cpuPct || 0), 0) / samples.length
      : 0,
    maxMemBytes: samples.reduce((m, s) => Math.max(m, s.memBytes || 0), 0),
    avgMemBytes: samples.length
      ? samples.reduce((m, s) => m + (s.memBytes || 0), 0) / samples.length
      : 0,
    samples,
  };

  const outDir = path.join(__dirname, '..', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'resources.json'), JSON.stringify(summary, null, 2));
  console.log(
    `captured ${summary.sampleCount} samples of "${LABEL}" via ${summary.source}: ` +
      `cpu avg ${summary.avgCpuPct.toFixed(1)}% / max ${summary.maxCpuPct.toFixed(1)}%, ` +
      `mem avg ${(summary.avgMemBytes / 1e6).toFixed(1)} MB / max ${(summary.maxMemBytes / 1e6).toFixed(1)} MB`
  );
}

main();
