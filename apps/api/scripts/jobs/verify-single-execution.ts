/**
 * Acceptance check for #1433: start N replicas of the JobRegistry against one
 * Redis and confirm each scheduled tick executes exactly once fleet-wide.
 *
 *   docker run --rm -d -p 6379:6379 redis:7
 *   npx ts-node -r tsconfig-paths/register scripts/jobs/verify-single-execution.ts
 *
 * Env: REDIS_URL (default redis://localhost:6379), REPLICAS (3), SECONDS (12).
 */
import { fork } from 'child_process';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const QUEUE = `verify-scheduled-jobs-${process.pid}`;
const RUNS_KEY = `${QUEUE}:runs`;

async function replica(queueName: string, runsKey: string): Promise<void> {
  const { JobRegistry } = await import('../../src/jobs/job-registry');
  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const registry = new JobRegistry({ queueName, redisUrl: REDIS_URL });
  registry.register({
    name: 'verify-tick',
    cron: '*/2 * * * * *', // every 2 seconds
    description: 'acceptance probe',
    handler: async () => {
      await redis.rpush(runsKey, `${process.pid}:${Date.now()}`);
    },
  });
  await registry.start();
  process.on('message', async () => {
    await registry.stop();
    await redis.quit();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const replicas = Number(process.env.REPLICAS ?? 3);
  const seconds = Number(process.env.SECONDS ?? 12);
  const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  await redis.del(RUNS_KEY);

  const children = Array.from({ length: replicas }, () =>
    fork(__filename, ['replica', QUEUE, RUNS_KEY], { execArgv: process.execArgv })
  );
  await new Promise((r) => setTimeout(r, seconds * 1000));
  children.forEach((c) => c.send('stop'));
  await Promise.all(children.map((c) => new Promise((r) => c.on('exit', r))));

  const runs = (await redis.lrange(RUNS_KEY, 0, -1)).map((r) => {
    const [pid, ts] = r.split(':');
    return { pid, slot: Math.floor(Number(ts) / 2000) };
  });
  const perSlot = new Map<number, number>();
  for (const r of runs) perSlot.set(r.slot, (perSlot.get(r.slot) ?? 0) + 1);
  const duplicates = [...perSlot.values()].filter((n) => n > 1).length;
  const pids = new Set(runs.map((r) => r.pid));

  // Clean up the throwaway queue's keys.
  const keys = await redis.keys(`bull:${QUEUE}:*`);
  if (keys.length) await redis.del(...keys);
  await redis.del(RUNS_KEY, 'hw:jobs:stats:verify-tick');
  await redis.quit();

  console.log(
    JSON.stringify(
      {
        replicas,
        seconds,
        executions: runs.length,
        ticks: perSlot.size,
        duplicates,
        executingPids: pids.size,
      },
      null,
      2
    )
  );
  if (duplicates > 0 || runs.length === 0) {
    console.error('FAIL: a tick executed more than once (or never ran)');
    process.exit(1);
  }
  console.log('PASS: every tick executed exactly once across all replicas');
}

if (process.argv[2] === 'replica') {
  replica(process.argv[3], process.argv[4]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
