# Security Headers

The API uses [Helmet.js](https://helmetjs.github.io/) to set HTTP security headers on every response.

## Headers Applied

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (also enforced via CSP `frame-ancestors 'none'`) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year, including subdomains; eligible for HSTS preload list |
| `X-XSS-Protection` | `0` | Disabled intentionally — modern browsers use CSP instead; the legacy XSS auditor can introduce vulnerabilities |
| `Referrer-Policy` | `no-referrer` | Suppresses the `Referer` header to prevent information leakage |
| `X-Powered-By` | *(removed)* | Helmet removes this header to avoid revealing the technology stack |

## Content Security Policy

```
default-src 'self'
script-src  'self'
style-src   'self' 'unsafe-inline'
img-src     'self' data:
connect-src 'self'
font-src    'self'
object-src  'none'
frame-ancestors 'none'
```

- `'unsafe-inline'` on `style-src` is required for inline styles used by some UI components.
- `data:` on `img-src` allows base64-encoded images (e.g. QR codes).
- `frame-ancestors 'none'` replaces the legacy `X-Frame-Options: DENY` in CSP-aware browsers.

## Body Size Limit

`express.json()` is configured with a size limit (default `50kb`, overridable via `MAX_REQUEST_BODY_SIZE`) to prevent payload-based DoS attacks. AI routes use a separate higher limit (`500kb`, overridable via `AI_REQUEST_BODY_SIZE`) to accommodate summarization payloads.
