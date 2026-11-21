// apps/api/src/lib/llm/index.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Central, provider-agnostic LLM client.
 *
 * All AI call sites in the API must route through this module. Model names,
 * timeouts, retries and token limits are configured here (and via env) so that
 * model changes never require touching individual feature modules.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default model. Must be a currently supported Gemini model. */
const DEFAULT_MODEL = 'gemini-2.0-flash';

/** Resolve the configured model name. */
export function getModelName(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

/** Request timeout in milliseconds. */
function getTimeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
}

/** Maximum number of attempts (initial try + retries). */
function getMaxAttempts(): number {
  const raw = Number(process.env.LLM_MAX_ATTEMPTS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
}

/** Base backoff delay in milliseconds (exponential). */
function getBaseBackoffMs(): number {
  const raw = Number(process.env.LLM_BASE_BACKOFF_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 500;
}

/** Maximum output tokens per request. */
function getMaxOutputTokens(): number {
  const raw = Number(process.env.LLM_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 2048;
}

/** Sampling temperature. */
function getTemperature(): number {
  const raw = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.2;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LlmErrorCode = 'AI_UNAVAILABLE' | 'AI_INVALID_RESPONSE' | 'AI_NOT_CONFIGURED';

/**
 * Typed error thrown by the LLM client. Callers should map `AI_UNAVAILABLE`
 * (and `AI_NOT_CONFIGURED`) to HTTP 503.
 */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(code: LlmErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.statusCode = code === 'AI_INVALID_RESPONSE' ? 502 : 503;
    this.cause = cause;
  }
}

/** Convenience guard for callers mapping errors to HTTP responses. */
export function isLlmError(err: unknown): err is LlmError {
  return err instanceof LlmError;
}

// ---------------------------------------------------------------------------
// Logging (structured, no prompt content)
// ---------------------------------------------------------------------------

interface LlmLogFields {
  event: 'llm.request' | 'llm.retry' | 'llm.error';
  model: string;
  operation: 'text' | 'json';
  attempt?: number;
  latencyMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorCode?: string;
  errorMessage?: string;
}

function log(fields: LlmLogFields): void {
  // Structured single-line JSON log. Never include prompt or response content.
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: fields.event === 'llm.error' ? 'error' : 'info', ...fields }));
  } catch {
    // Logging must never break a request.
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let cachedClient: GoogleGenerativeAI | null = null;
let cachedApiKey: string | null = null;

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) {
    throw new LlmError('AI_NOT_CONFIGURED', 'LLM provider API key is not configured');
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenerativeAI(apiKey);
    cachedApiKey = apiKey;
  }
  return cachedClient;
}

interface GenerateOptions {
  operation: 'text' | 'json';
  /** Optional system instruction prepended to the prompt. */
  systemInstruction?: string;
  /** Override max output tokens for this call. */
  maxOutputTokens?: number;
  /** Override temperature for this call. */
  temperature?: number;
  /** Optional JSON schema hint (informational; Gemini uses responseMimeType). */
  schema?: Record<string, unknown>;
}

interface GenerationResult {
  text: string;
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  const anyErr = err as { status?: number; statusCode?: number; message?: string } | undefined;
  const status = anyErr?.status ?? anyErr?.statusCode;
  if (typeof status === 'number') {
    // Retry on rate limiting and server errors.
    return status === 429 || status === 408 || (status >= 500 && status < 600);
  }
  const msg = (anyErr?.message || '').toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('fetch failed') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable')
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new LlmError('AI_UNAVAILABLE', `LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generate(prompt: string, options: GenerateOptions): Promise<GenerationResult> {
  if (!prompt || typeof prompt !== 'string') {
    throw new LlmError('AI_INVALID_RESPONSE', 'Prompt must be a non-empty string');
  }

  const model = getModelName();
  const maxAttempts = getMaxAttempts();
  const timeoutMs = getTimeoutMs();
  const baseBackoffMs = getBaseBackoffMs();

  const client = getClient();
  const generativeModel = client.getGenerativeModel({
    model,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? getMaxOutputTokens(),
      temperature: options.temperature ?? getTemperature(),
      ...(options.operation === 'json' ? { responseMimeType: 'application/json' } : {}),
    },
    ...(options.systemInstruction
      ? { systemInstruction: options.systemInstruction }
      : {}),
  });

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await withTimeout(
        generativeModel.generateContent(prompt),
        timeoutMs,
      );

      const latencyMs = Date.now() - startedAt;
      const response = result.response;
      const text = response.text();

      const usageMeta = response.usageMetadata;
      const usage = {
        promptTokens: usageMeta?.promptTokenCount ?? 0,
        outputTokens: usageMeta?.candidatesTokenCount ?? 0,
        totalTokens: usageMeta?.totalTokenCount ?? 0,
      };

      log({
        event: 'llm.request',
        model,
        operation: options.operation,
        attempt,
        latencyMs,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });

      if (!text || typeof text !== 'string') {
        throw new LlmError('AI_INVALID_RESPONSE', 'LLM returned an empty response');
      }

      return { text, usage };
    } catch (err) {
      lastError = err;
      const latencyMs = Date.now() - startedAt;

      // Do not retry invalid-response errors or configuration errors.
      if (err instanceof LlmError && err.code !== 'AI_UNAVAILABLE') {
        log({
          event: 'llm.error',
          model,
          operation: options.operation,
          attempt,
          latencyMs,
          errorCode: err.code,
          errorMessage: err.message,
        });
        throw err;
      }

      const retryable = err instanceof LlmError ? true : isRetryable(err);
      const isLast = attempt >= maxAttempts;

      if (!retryable || isLast) {
        const message =
          err instanceof Error ? err.message : 'Unknown LLM provider error';
        log({
          event: 'llm.error',
          model,
          operation: options.operation,
          attempt,
          latencyMs,
          errorCode: 'AI_UNAVAILABLE',
          errorMessage: message,
        });
        throw new LlmError('AI_UNAVAILABLE', `AI provider unavailable: ${message}`, err);
      }

      const backoff = baseBackoffMs * Math.pow(2, attempt - 1);
      log({
        event: 'llm.retry',
        model,
        operation: options.operation,
        attempt,
        latencyMs,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      await sleep(backoff);
    }
  }

  // Unreachable, but keeps TypeScript satisfied.
  throw new LlmError(
    'AI_UNAVAILABLE',
    'AI provider unavailable after retries',
    lastError,
  );
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export interface GenerateTextOptions {
  systemInstruction?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * Generate free-form text from a prompt.
 * Throws `LlmError` with code `AI_UNAVAILABLE` on provider failure.
 */
export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  const { text } = await generate(prompt, {
    operation: 'text',
    systemInstruction: options.systemInstruction,
    maxOutputTokens: options.maxOutputTokens,
    temperature: options.temperature,
  });
  return text;
}

export interface GenerateJsonOptions<T> extends GenerateTextOptions {
  /** Optional JSON schema hint passed to the provider. */
  schema?: Record<string, unknown>;
  /** Optional validator; throw to reject the parsed value. */
  validate?: (value: unknown) => value is T;
}

/**
 * Generate a JSON object from a prompt and parse it.
 * Throws `LlmError` with code `AI_INVALID_RESPONSE` if the response cannot be
 * parsed as JSON, or `AI_UNAVAILABLE` on provider failure.
 */
export async function generateJson<T = unknown>(
  prompt: string,
  schema?: Record<string, unknown>,
  options: GenerateJsonOptions<T> = {},
): Promise<T> {
  const { text } = await generate(prompt, {
    operation: 'json',
    systemInstruction: options.systemInstruction,
    maxOutputTokens: options.maxOutputTokens,
    temperature: options.temperature,
    schema,
  });

  const cleaned = stripCodeFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new LlmError('AI_INVALID_RESPONSE', 'LLM returned invalid JSON', err);
  }

  if (options.validate && !options.validate(parsed)) {
    throw new LlmError('AI_INVALID_RESPONSE', 'LLM response failed validation');
  }

  return parsed as T;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * Lightweight health check used by the nightly smoke test.
 * Returns true if the configured model responds.
 */
export async function smokeTest(): Promise<boolean> {
  try {
    const text = await generateText('Reply with the single word: OK', {
      maxOutputTokens: 16,
      temperature: 0,
    });
    return text.trim().length > 0;
  } catch (err) {
    log({
      event: 'llm.error',
      model: getModelName(),
      operation: 'text',
      errorCode: err instanceof LlmError ? err.code : 'AI_UNAVAILABLE',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export const llmConfig = {
  getModelName,
  getTimeoutMs,
  getMaxAttempts,
  getBaseBackoffMs,
  getMaxOutputTokens,
  getTemperature,
};
```

```typescript
// apps/api/src/lib/llm/errors.ts
export { LlmError, isLlmError } from './index';
export type { LlmErrorCode } from './index';
```

```typescript
// apps/api/src/lib/llm/smoke-test.ts
/**
 * Nightly integration smoke test for the configured LLM model.
 *
 * Run via: `tsx apps/api/src/lib/llm/smoke-test.ts`
 * or schedule in CI (e.g. GitHub Actions nightly cron).
 */
import { getModelName, smokeTest } from './index';

async function main(): Promise<void> {
  const model = getModelName();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: 'llm.smoke_test.start', model }));

  const ok = await smokeTest();

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event: 'llm.smoke_test.result', model, ok }));

  if (!ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: 'llm.smoke_test.error',
        errorMessage: err instanceof Error ? err.message : String(err),
      }),
    );
    process.exitCode = 1;
  });
}

export { main as runSmokeTest };