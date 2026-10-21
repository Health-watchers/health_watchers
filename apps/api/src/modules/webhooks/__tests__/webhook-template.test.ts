import { applyTemplate, type EventContext } from '../webhook-template';
import { consumeWebhookRateLimit, __resetWebhookRateLimiter } from '../webhook-rate-limiter';

const ctx: EventContext = {
  event: 'patient.created',
  data: { id: 'p1', name: 'Ada', risk: { level: 'high' } },
  timestamp: '2026-08-30T00:00:00.000Z',
  webhookId: 'wh1',
};

describe('applyTemplate', () => {
  it('returns the raw envelope when no template is set', () => {
    expect(applyTemplate(undefined, ctx)).toEqual({
      event: 'patient.created',
      data: ctx.data,
      timestamp: ctx.timestamp,
    });
  });

  it('interpolates {{path}} placeholders in string leaves', () => {
    const out = applyTemplate(
      { type: 'evt:{{event}}', patient: '{{data.name}}', when: '{{timestamp}}' },
      ctx
    );
    expect(out).toEqual({
      type: 'evt:patient.created',
      patient: 'Ada',
      when: '2026-08-30T00:00:00.000Z',
    });
  });

  it('preserves value type for a whole-string placeholder', () => {
    const out = applyTemplate({ payload: '{{data}}', level: '{{data.risk.level}}' }, ctx);
    expect(out.payload).toEqual(ctx.data); // object, not stringified
    expect(out.level).toBe('high');
  });

  it('renders unknown paths as empty string', () => {
    const out = applyTemplate({ x: '{{data.missing.deep}}' }, ctx);
    expect(out.x).toBe('');
  });

  it('recurses into nested objects and arrays', () => {
    const out = applyTemplate({ meta: { id: '{{data.id}}' }, tags: ['{{event}}', 'static'] }, ctx);
    expect(out).toEqual({ meta: { id: 'p1' }, tags: ['patient.created', 'static'] });
  });
});

describe('consumeWebhookRateLimit', () => {
  beforeEach(() => __resetWebhookRateLimiter());

  it('allows unlimited when limit is 0', () => {
    for (let i = 0; i < 100; i++) {
      expect(consumeWebhookRateLimit('wh', 0).allowed).toBe(true);
    }
  });

  it('blocks once the per-minute limit is reached', () => {
    const t0 = 1_000_000;
    expect(consumeWebhookRateLimit('wh', 2, t0).allowed).toBe(true);
    expect(consumeWebhookRateLimit('wh', 2, t0 + 1).allowed).toBe(true);
    const third = consumeWebhookRateLimit('wh', 2, t0 + 2);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it('recovers after the window slides past old hits', () => {
    const t0 = 2_000_000;
    consumeWebhookRateLimit('wh', 1, t0);
    expect(consumeWebhookRateLimit('wh', 1, t0 + 1).allowed).toBe(false);
    expect(consumeWebhookRateLimit('wh', 1, t0 + 60_001).allowed).toBe(true);
  });

  it('tracks each webhook independently', () => {
    const t0 = 3_000_000;
    consumeWebhookRateLimit('a', 1, t0);
    expect(consumeWebhookRateLimit('b', 1, t0).allowed).toBe(true);
  });
});
