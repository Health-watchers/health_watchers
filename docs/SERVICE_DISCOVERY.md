# Service Discovery

Health Watchers services should resolve dependencies through environment-provided URLs in local and Kubernetes DNS in deployed environments.

## Variables

- `API_BASE_URL`
- `WEB_BASE_URL`
- `STELLAR_SERVICE_URL`
- `REDIS_URL`
- `DATABASE_URL`

Prefer service names such as `http://health-watchers-api:3000` inside clusters.
