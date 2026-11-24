/**
 * PHI log-leak detection for integration tests (issue #1498).
 *
 * Captures everything a test run emits through the three channels PHI could escape by:
 *   - the application logger (a real pino instance with the production redaction rules)
 *   - console.* calls
 *   - Sentry (captureException / captureMessage / breadcrumbs / context), mocked
 * Callers can add other sinks (e.g. audit log files) as extra `CapturedLine`s.
 *
 * Tests seed patients with unique canary values and call `assertNoCanaries` at the end;
 * any captured line containing a canary fails the run and is printed verbatim.
 */
import { Writable } from 'stream';
import { inspect } from 'util';
import pino from 'pino';
import type * as LoggerModule from '../../utils/logger';

// requireActual: this helper is itself the factory for the mocked logger module.
const { loggerOptions } = jest.requireActual<typeof LoggerModule>('../../utils/logger');

export type LogSource = 'logger' | 'console' | 'sentry' | 'audit-file';

export interface CapturedLine {
  source: LogSource;
  line: string;
}

export interface CanaryLeak extends CapturedLine {
  canary: string;
}

const captured: CapturedLine[] = [];

function record(source: LogSource, args: unknown[]): void {
  const line = args
    .map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 10, breakLength: Infinity })))
    .join(' ');
  captured.push({ source, line });
}

/** Build a pino logger with production options that writes into `sink`. */
export function createCapturingLogger(sink: CapturedLine[] = captured): pino.Logger {
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      sink.push({ source: 'logger', line: chunk.toString().trim() });
      callback();
    },
  });
  // 'trace' so debug-level logs are checked too — they reach prod when LOG_LEVEL is lowered.
  return pino({ ...loggerOptions, level: 'trace' }, stream);
}

/** Module shape for `jest.mock('@api/utils/logger', ...)` */
export function captureLoggerModule() {
  const logger = createCapturingLogger();
  return { __esModule: true, default: logger, loggerOptions };
}

/** Module shape for `jest.mock('@sentry/node', ...)` — records every reporting call. */
export function captureSentryModule() {
  const recorder =
    (name: string) =>
    (...args: unknown[]) =>
      record('sentry', [`Sentry.${name}`, ...args]);
  const scope = {
    setTag: recorder('scope.setTag'),
    setExtra: recorder('scope.setExtra'),
    setContext: recorder('scope.setContext'),
    setUser: recorder('scope.setUser'),
    setLevel: () => undefined,
  };
  return {
    __esModule: true,
    captureException: recorder('captureException'),
    captureMessage: recorder('captureMessage'),
    addBreadcrumb: recorder('addBreadcrumb'),
    setContext: recorder('setContext'),
    setExtra: recorder('setExtra'),
    setTag: recorder('setTag'),
    setUser: recorder('setUser'),
    withScope: (cb: (s: typeof scope) => void) => cb(scope),
    init: () => undefined,
  };
}

/** Route console.* into the capture buffer for the rest of the test file. */
export function captureConsole(): void {
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => record('console', args));
  }
}

export function capturedLines(): readonly CapturedLine[] {
  return captured;
}

/** Case-insensitive search for each canary across the captured lines. */
export function findCanaryLeaks(
  canaries: readonly string[],
  lines: readonly CapturedLine[] = captured
): CanaryLeak[] {
  const leaks: CanaryLeak[] = [];
  for (const entry of lines) {
    const haystack = entry.line.toLowerCase();
    for (const canary of canaries) {
      if (haystack.includes(canary.toLowerCase())) leaks.push({ ...entry, canary });
    }
  }
  return leaks;
}

/** Throws with every offending line so the failure points straight at the leak. */
export function assertNoCanaries(
  canaries: readonly string[],
  lines: readonly CapturedLine[] = captured
): void {
  const leaks = findCanaryLeaks(canaries, lines);
  if (leaks.length === 0) return;
  const detail = leaks.map((l) => `  [${l.source}] canary "${l.canary}" in: ${l.line}`).join('\n');
  throw new Error(`PHI canary values found in captured output:\n${detail}`);
}
