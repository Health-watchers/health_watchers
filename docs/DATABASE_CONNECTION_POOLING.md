# Database Connection Pooling

Use bounded pools per service to protect MongoDB during traffic spikes.

Recommended defaults:

- API services: `maxPoolSize=50`, `minPoolSize=5`
- Worker services: `maxPoolSize=20`, `minPoolSize=2`
- Timeout: `serverSelectionTimeoutMS=5000`

Expose pool wait time and checkout failures as metrics.
