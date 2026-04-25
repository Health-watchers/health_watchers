import logger from './logger.js';

export interface HorizonError {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  suggestedAction: string;
  statusCode: number;
}

export interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
const CIRCUIT_BREAKER_WINDOW = 60000; // 60 seconds

let circuitBreakerState: CircuitBreakerState = {
  status: 'closed',
  failureCount: 0,
  lastFailureTime: 0,
  successCount: 0,
};

/**
 * Parse Horizon error response and return structured error info
 */
export function parseHorizonError(error: any): HorizonError {
  const status = error.response?.status;
  const data = error.response?.data;

  // Handle specific Horizon error codes
  if (data?.extras?.result_codes) {
    const resultCodes = data.extras.result_codes;

    // Transaction failed
    if (resultCodes.transaction === 'tx_failed') {
      return {
        errorCode: 'transaction_failed',
        errorMessage: 'Transaction failed on Horizon',
        retryable: false,
        suggestedAction: 'Check transaction details and try again',
        statusCode: 400,
      };
    }

    // Insufficient balance
    if (resultCodes.operations?.includes('op_underfunded')) {
      return {
        errorCode: 'insufficient_balance',
        errorMessage: 'Account has insufficient balance',
        retryable: false,
        suggestedAction: 'Add funds to account',
        statusCode: 402,
      };
    }

    // Bad sequence number
    if (resultCodes.transaction === 'tx_bad_seq') {
      return {
        errorCode: 'bad_sequence',
        errorMessage: 'Account sequence number is invalid',
        retryable: true,
        suggestedAction: 'Retry with fresh account sequence',
        statusCode: 400,
      };
    }
  }

  // Handle HTTP status codes
  if (status === 429) {
    return {
      errorCode: 'rate_limit',
      errorMessage: 'Horizon rate limit exceeded',
      retryable: true,
      suggestedAction: 'Retry after delay',
      statusCode: 429,
    };
  }

  if (status === 503 || status === 504) {
    return {
      errorCode: 'horizon_unavailable',
      errorMessage: 'Horizon service temporarily unavailable',
      retryable: true,
      suggestedAction: 'Retry after delay',
      statusCode: 503,
    };
  }

  if (status === 400 && data?.title === 'Bad Request') {
    return {
      errorCode: 'bad_request',
      errorMessage: data?.detail || 'Bad request to Horizon',
      retryable: false,
      suggestedAction: 'Check request parameters',
      statusCode: 400,
    };
  }

  // Network timeout
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      errorCode: 'timeout',
      errorMessage: 'Request timeout',
      retryable: true,
      suggestedAction: 'Retry with higher fee',
      statusCode: 504,
    };
  }

  // Default error
  return {
    errorCode: 'unknown_error',
    errorMessage: error.message || 'Unknown error',
    retryable: false,
    suggestedAction: 'Check logs for details',
    statusCode: 500,
  };
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const horizonError = parseHorizonError(error);

      if (!horizonError.retryable || attempt === maxRetries - 1) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        { attempt: attempt + 1, maxRetries, delayMs, errorCode: horizonError.errorCode },
        'Retrying after backoff'
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Check and update circuit breaker state
 */
export function checkCircuitBreaker(): boolean {
  const now = Date.now();
  const timeSinceLastFailure = now - circuitBreakerState.lastFailureTime;

  // Reset if outside window
  if (timeSinceLastFailure > CIRCUIT_BREAKER_WINDOW) {
    circuitBreakerState = {
      status: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
    };
  }

  // Check if circuit should open
  if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    if (circuitBreakerState.status === 'closed') {
      circuitBreakerState.status = 'open';
      logger.error('Circuit breaker opened after 5 consecutive failures');
    }

    // Try half-open after timeout
    if (circuitBreakerState.status === 'open' && timeSinceLastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      circuitBreakerState.status = 'half-open';
      logger.info('Circuit breaker half-open, testing recovery');
    }
  }

  return circuitBreakerState.status !== 'open';
}

/**
 * Record success in circuit breaker
 */
export function recordSuccess(): void {
  if (circuitBreakerState.status === 'half-open') {
    circuitBreakerState.status = 'closed';
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.successCount = 0;
    logger.info('Circuit breaker closed, service recovered');
  }
}

/**
 * Record failure in circuit breaker
 */
export function recordFailure(): void {
  circuitBreakerState.failureCount++;
  circuitBreakerState.lastFailureTime = Date.now();
}

/**
 * Get circuit breaker state
 */
export function getCircuitBreakerState(): CircuitBreakerState {
  return { ...circuitBreakerState };
}
