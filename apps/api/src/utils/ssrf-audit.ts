import logger from '@api/utils/logger';
import { auditLog } from '@api/modules/audit/audit.service';

export type BlockedOutboundSource =
  | 'webhook-enqueue'
  | 'webhook-delivery'
  | 'webhook-retry'
  | 'stellar'
  | 'exchange-rate';

export interface BlockedOutboundParams {
  url: string;
  reason: string;
  source: BlockedOutboundSource;
  webhookId?: string;
  deliveryId?: string;
  clinicId?: string;
}

/**
 * Strip query string and userinfo so tokens/credentials never land in audit
 * metadata. Keeps scheme + host + path.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Record a blocked outbound request (SSRF protection, issue #1668) in the
 * audit log and the application logger. Best-effort: audit failures must never
 * break delivery.
 */
export async function logBlockedOutboundRequest(params: BlockedOutboundParams): Promise<void> {
  const safeUrl = redactUrl(params.url);
  logger.warn(
    {
      url: safeUrl,
      reason: params.reason,
      source: params.source,
      webhookId: params.webhookId,
      deliveryId: params.deliveryId,
    },
    'Blocked outbound request (SSRF protection)'
  );

  try {
    await auditLog({
      action: 'SECURITY_SSRF_BLOCKED',
      resourceType: 'OutboundRequest',
      resourceId: params.webhookId ?? params.deliveryId,
      clinicId: params.clinicId,
      outcome: 'FAILURE',
      metadata: {
        url: safeUrl,
        reason: params.reason,
        source: params.source,
        ...(params.webhookId ? { webhookId: params.webhookId } : {}),
        ...(params.deliveryId ? { deliveryId: params.deliveryId } : {}),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to audit blocked outbound request');
  }
}
