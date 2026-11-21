import re

p = 'apps/api/src/modules/webhooks/webhook.service.ts'
s = open(p).read()

s = s.replace(
    "import { validateWebhookUrl } from '@api/utils/url-validator';",
    "import { validateWebhookUrl } from '@api/utils/url-validator';\nimport { logBlockedOutboundRequest } from '@api/utils/ssrf-audit';",
)

old = """    logger.error({ webhookId, event, url, reason }, 'Webhook delivery blocked: invalid URL');
    return delivery;"""
new = """    await logBlockedOutboundRequest({
      url,
      reason: reason || 'Blocked URL',
      source: 'webhook-enqueue',
      webhookId,
      deliveryId: String((delivery as any)._id ?? ''),
    });
    return delivery;"""
assert old in s
s = s.replace(old, new)

s = s.replace(
    "async function executeDelivery(delivery: IWebhookDelivery, secret: string): Promise<void> {",
    "export async function executeDelivery(delivery: IWebhookDelivery, secret: string): Promise<void> {",
)

old2 = """  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bodyString = JSON.stringify(delivery.payload);"""
new2 = """  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // SSRF protection (#1668): re-validate on every attempt — the URL may have
    // been mutated in the DB since enqueue time.
    const urlCheck = validateWebhookUrl(delivery.url);
    if (!urlCheck.valid) {
      const reason = urlCheck.reason || 'Blocked URL';
      delivery.status = 'dead';
      delivery.error = `Blocked URL: ${reason}`;
      await delivery.save();
      await WebhookEventLogModel.findOneAndUpdate(
        { deliveryId: delivery._id },
        { status: 'dead', error: delivery.error }
      );
      await logBlockedOutboundRequest({
        url: delivery.url,
        reason,
        source: 'webhook-delivery',
        webhookId: String(delivery.webhookId),
        deliveryId: String(delivery._id),
      });
      return;
    }

    const bodyString = JSON.stringify(delivery.payload);"""
assert old2 in s
s = s.replace(old2, new2)

open(p, 'w').write(s)

# retry-worker
p2 = 'apps/api/src/modules/webhooks/retry-worker.ts'
r = open(p2).read()
r = r.replace(
    "import { validateWebhookUrl } from '@api/utils/url-validator';",
    "import { validateWebhookUrl } from '@api/utils/url-validator';\nimport { logBlockedOutboundRequest } from '@api/utils/ssrf-audit';",
)
old3 = """    await delivery.save();
    logger.error({ deliveryId, reason }, 'Delivery blocked: invalid URL');
    return false;"""
new3 = """    await delivery.save();
    await logBlockedOutboundRequest({
      url: delivery.url,
      reason: reason || 'Blocked URL',
      source: 'webhook-retry',
      webhookId: String(webhook._id),
      deliveryId,
    });
    return false;"""
assert old3 in r
r = r.replace(old3, new3)
open(p2, 'w').write(r)
print('ok')
