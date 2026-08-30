# ops/cdn

Edge / CDN infrastructure configuration for Health Watchers. Strategy and TTL
matrix: [`docs/CDN_CACHING_STRATEGY.md`](../../docs/CDN_CACHING_STRATEGY.md).

| File | Purpose |
|------|---------|
| `cloudfront-distribution.json` | AWS CloudFront distribution config: cache policies per path, Origin Group with DR failover, compression, TLS, response-headers policy. Apply with `aws cloudfront create-distribution --distribution-config file://cloudfront-distribution.json`. |
| `cloudflare-config.yaml` | Cloudflare zone settings, cache rules, transform rules, image resizing, load balancer + health monitors. Apply via the provider Terraform module or `scripts/cdn/apply-cloudflare.sh` (API). |
| `waf-rules.json` | Provider-agnostic description of the WAF web ACL / firewall rules and rate limits. Rendered to AWS WAFv2 or Cloudflare rulesets. |
| `nginx-cache.conf` | Origin nginx: gzip + brotli, pre-compressed asset serving, `Cache-Control` per location, micro-cache for public HTML, `stale-if-error`. Include from the web container's nginx config. |

Operational scripts are in [`../../scripts/cdn/`](../../scripts/cdn/):

| Script | Purpose |
|--------|---------|
| `purge-cache.sh` | Invalidate paths on one or all providers (CLI wrapper for the deploy pipeline and runbooks). |
| `cdn-performance-report.sh` | Weekly analytics pull: hit ratio, origin offload / $ saved, edge TTFB, top MISSes. |
| `verify-cache-headers.sh` | Post-deploy smoke test that each asset class returns the right cache + compression headers and hits on the second request. |

## Provider choice

CloudFront is primary (tightest AWS integration for origin, WAF, Shield, and
cost tags). Cloudflare config is maintained in parallel as the failover / second
opinion and for its image resizing + bot management. `NEXT_PUBLIC_CDN_PROVIDER`
selects which one the app emits URLs for; see `.env.cdn.example`.
