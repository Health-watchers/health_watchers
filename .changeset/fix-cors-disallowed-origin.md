---
"api": patch
---

fix: refuse disallowed CORS origins with no CORS headers instead of raising a plain Error that the global error handler turned into a 500; the decision now lives in `src/config/cors.ts` and is covered by tests (#1868)
