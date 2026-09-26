# Caching Strategy

Use Redis for short-lived operational data and CDN/browser caches for static web assets.

## Redis

- Session lookups: 5-15 minutes.
- Feature flags and service discovery: 60 seconds.
- Expensive dashboard aggregates: 30-120 seconds.

Never cache PHI unless the cache is encrypted, access-controlled, and covered by the same retention policy as the source data.
