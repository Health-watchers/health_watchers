# Contract Testing

This project uses [Pact](https://pact.io) for consumer-driven contract
testing between the web client (consumer) and the API (provider).

## How it works

1. **Consumer tests** (`scripts/pact/consumer.pact.test.js`) define the
   expected requests/responses the web app makes to the API. Running them
   generates a pact file under `pacts/`.
2. **Publishing** — the CI/CD workflow (`.github/workflows/contract-tests.yml`)
   publishes generated pacts to the Pact Broker, tagged with the commit SHA
   and branch.
3. **Provider verification** (`scripts/pact/provider.verify.test.js`) replays
   the recorded interactions against a running instance of the API and
   confirms the responses match.
4. **`can-i-deploy`** — before merging, CI runs `pact-broker can-i-deploy` to
   confirm the consumer version is compatible with what's already deployed,
   automatically catching breaking changes.
5. **Versioning** — every pact publish is tagged with the git SHA and branch
   name so historical compatibility can be queried at any time.
6. **Dashboard** — the contract-report job pulls the broker's matrix view and
   uploads it as a build artifact for visibility into contract health.

## Local development

```bash
npm run test:contract:consumer   # generate/update pacts
npm run test:contract:provider   # verify provider against broker pacts
```

## Contract-driven development workflow

- Add or update a consumer interaction in `consumer.pact.test.js` first.
- Run the consumer test to generate the pact.
- Implement the provider change to satisfy the new interaction.
- Run provider verification locally before opening a PR.
- CI re-verifies and blocks the merge via `can-i-deploy` if the contract is
  broken for any currently deployed consumer version.
