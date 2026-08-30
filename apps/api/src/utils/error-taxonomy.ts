// Error taxonomy for consistent error codes and categories
export enum ErrorCategory {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  PAYMENT = 'PAYMENT_ERROR',
  DATABASE = 'DATABASE_ERROR',
  EXTERNAL_API = 'EXTERNAL_API_ERROR',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorTaxonomy {
  code: string;
  category: ErrorCategory;
  statusCode: number;
  severity: ErrorSeverity;
  clientMessage: string;
  i18nKey?: string;
  trackInSentry?: boolean;
}

export const ERROR_TAXONOMY: Record<string, ErrorTaxonomy> = {
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    category: ErrorCategory.VALIDATION,
    statusCode: 400,
    severity: ErrorSeverity.LOW,
    clientMessage: 'The request contains invalid data. Please check your input and try again.',
    i18nKey: 'errors.invalidRequest',
    trackInSentry: false,
  },
  MISSING_FIELD: {
    code: 'MISSING_FIELD',
    category: ErrorCategory.VALIDATION,
    statusCode: 400,
    severity: ErrorSeverity.LOW,
    clientMessage: 'A required field is missing from your request.',
    i18nKey: 'errors.missingField',
    trackInSentry: false,
  },
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    category: ErrorCategory.AUTHENTICATION,
    statusCode: 401,
    severity: ErrorSeverity.LOW,
    clientMessage: 'Your authentication token is invalid. Please log in again.',
    i18nKey: 'errors.invalidToken',
    trackInSentry: false,
  },
  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    category: ErrorCategory.AUTHENTICATION,
    statusCode: 401,
    severity: ErrorSeverity.LOW,
    clientMessage: 'Your session has expired. Please log in again.',
    i18nKey: 'errors.tokenExpired',
    trackInSentry: false,
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    category: ErrorCategory.AUTHENTICATION,
    statusCode: 401,
    severity: ErrorSeverity.LOW,
    clientMessage: 'You must be logged in to access this resource.',
    i18nKey: 'errors.unauthorized',
    trackInSentry: false,
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    category: ErrorCategory.AUTHORIZATION,
    statusCode: 403,
    severity: ErrorSeverity.LOW,
    clientMessage: 'You do not have permission to access this resource.',
    i18nKey: 'errors.forbidden',
    trackInSentry: false,
  },
  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    category: ErrorCategory.NOT_FOUND,
    statusCode: 404,
    severity: ErrorSeverity.LOW,
    clientMessage: 'The requested resource was not found.',
    i18nKey: 'errors.resourceNotFound',
    trackInSentry: false,
  },
  DUPLICATE_ENTRY: {
    code: 'DUPLICATE_ENTRY',
    category: ErrorCategory.CONFLICT,
    statusCode: 409,
    severity: ErrorSeverity.LOW,
    clientMessage: 'A record with this value already exists.',
    i18nKey: 'errors.duplicateEntry',
    trackInSentry: false,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    category: ErrorCategory.RATE_LIMITED,
    statusCode: 429,
    severity: ErrorSeverity.LOW,
    clientMessage: 'Too many requests. Please try again later.',
    i18nKey: 'errors.rateLimitExceeded',
    trackInSentry: false,
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    category: ErrorCategory.DATABASE,
    statusCode: 500,
    severity: ErrorSeverity.HIGH,
    clientMessage: 'A database error occurred. Our team has been notified.',
    i18nKey: 'errors.databaseError',
    trackInSentry: true,
  },
  PAYMENT_FAILED: {
    code: 'PAYMENT_FAILED',
    category: ErrorCategory.PAYMENT,
    statusCode: 402,
    severity: ErrorSeverity.MEDIUM,
    clientMessage: 'Payment processing failed. Please try again or contact support.',
    i18nKey: 'errors.paymentFailed',
    trackInSentry: true,
  },
  EXTERNAL_API_ERROR: {
    code: 'EXTERNAL_API_ERROR',
    category: ErrorCategory.EXTERNAL_API,
    statusCode: 502,
    severity: ErrorSeverity.MEDIUM,
    clientMessage: 'An external service is temporarily unavailable. Please try again later.',
    i18nKey: 'errors.externalApiError',
    trackInSentry: true,
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    category: ErrorCategory.SERVICE_UNAVAILABLE,
    statusCode: 503,
    severity: ErrorSeverity.CRITICAL,
    clientMessage: 'The service is temporarily unavailable. Please try again later.',
    i18nKey: 'errors.serviceUnavailable',
    trackInSentry: true,
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    category: ErrorCategory.INTERNAL,
    statusCode: 500,
    severity: ErrorSeverity.CRITICAL,
    clientMessage:
      'An unexpected error occurred. Our team has been notified. Please try again later.',
    i18nKey: 'errors.internalServerError',
    trackInSentry: true,
  },
};

export function getTaxonomy(code: string): ErrorTaxonomy {
  return ERROR_TAXONOMY[code] || ERROR_TAXONOMY.INTERNAL_SERVER_ERROR;
}
