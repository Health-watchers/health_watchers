# API Contract Testing

Health Watchers uses Pact-style consumer/provider checks for API compatibility.

## Scope

- Keep public API request and response shapes stable.
- Validate breaking changes before deployment.
- Store generated pacts under `pacts/`.

## Workflow

1. Add or update consumer expectations in `scripts/pact/consumer.pact.test.js`.
2. Verify provider behavior with `scripts/pact/provider.verify.test.js`.
3. Publish pact artifacts from CI only after provider verification passes.
