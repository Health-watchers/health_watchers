/**
 * #1253 — Webhook payload templating.
 *
 * A webhook may define a JSON `payloadTemplate`. String values in the template
 * support `{{ dotted.path }}` placeholders resolved against the event context
 * `{ event, data, timestamp, webhookId }`. Unknown paths render as an empty
 * string. When no template is set the raw event envelope is delivered
 * unchanged.
 *
 * This is deliberately not a full expression language — no logic, no function
 * calls — so a template can never do more than reshape the event payload.
 */

const PLACEHOLDER = /\{\{\s*([\w.$-]+)\s*\}\}/g;
const MAX_DEPTH = 10;

function resolvePath(ctx: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, ctx);
}

function renderString(tpl: string, ctx: unknown): unknown {
  // Whole-string single placeholder → preserve the resolved value's type.
  const whole = tpl.match(/^\{\{\s*([\w.$-]+)\s*\}\}$/);
  if (whole) {
    const value = resolvePath(ctx, whole[1]);
    return value === undefined ? '' : value;
  }
  return tpl.replace(PLACEHOLDER, (_, path) => {
    const value = resolvePath(ctx, path);
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function render(node: unknown, ctx: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return node;
  if (typeof node === 'string') return renderString(node, ctx);
  if (Array.isArray(node)) return node.map((n) => render(n, ctx, depth + 1));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = render(v, ctx, depth + 1);
    return out;
  }
  return node;
}

export interface EventContext {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  webhookId: string;
  metadata?: Record<string, unknown>;
}

export function applyTemplate(
  template: Record<string, unknown> | null | undefined,
  ctx: EventContext
): Record<string, unknown> {
  if (!template) {
    const { event, data, timestamp, metadata } = ctx;
    return { event, data, timestamp, ...(metadata ? { metadata } : {}) };
  }
  return render(template, ctx, 0) as Record<string, unknown>;
}
