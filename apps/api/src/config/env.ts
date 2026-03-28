/**
 * Environment variable validation — must be imported before any other module.
 * Uses zod to parse and validate all required env vars.
 * Prints a table of missing/invalid vars and exits with code 1 on failure.
 */
import { z } from 'zod';

const envSchema = z.object({
  MONGO_URI: z
    .string({ required_error: 'Missing required env var: MONGO_URI' })
    .min(1, 'Missing required env var: MONGO_URI'),

  JWT_ACCESS_TOKEN_SECRET: z
    .string({ required_error: 'Missing required env var: JWT_ACCESS_TOKEN_SECRET' })
    .min(32, 'JWT_ACCESS_TOKEN_SECRET must be at least 32 characters (too weak)'),

  JWT_REFRESH_TOKEN_SECRET: z
    .string({ required_error: 'Missing required env var: JWT_REFRESH_TOKEN_SECRET' })
    .min(32, 'JWT_REFRESH_TOKEN_SECRET must be at least 32 characters (too weak)'),

  API_PORT: z
    .string({ required_error: 'Missing required env var: API_PORT' })
    .min(1, 'Missing required env var: API_PORT'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('\n❌ Environment validation failed:\n');

  const rows = result.error.errors.map((e) => ({
    Variable: String(e.path[0] ?? 'unknown'),
    Issue: e.message,
  }));

  // Print a simple table
  const varWidth = Math.max(8, ...rows.map((r) => r.Variable.length));
  const issueWidth = Math.max(5, ...rows.map((r) => r.Issue.length));
  const divider = `+-${'-'.repeat(varWidth)}-+-${'-'.repeat(issueWidth)}-+`;

  console.error(divider);
  console.error(`| ${'Variable'.padEnd(varWidth)} | ${'Issue'.padEnd(issueWidth)} |`);
  console.error(divider);
  for (const row of rows) {
    console.error(`| ${row.Variable.padEnd(varWidth)} | ${row.Issue.padEnd(issueWidth)} |`);
  }
  console.error(divider);
  console.error('');

  process.exit(1);
}

export const env = result.data;
