# Architecture Diagrams

Source diagrams for [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), written in [Mermaid](https://mermaid.js.org/)
syntax. Each `.mmd` file is embedded directly in `ARCHITECTURE.md` via fenced ```mermaid``` code
blocks (GitHub renders these natively), and also kept here as a standalone source file.

| File | Shows |
|------|-------|
| `system-architecture.mmd` | High-level component diagram: client layer, API gateway, service layer (API/Stellar/Redis), and data layer (MongoDB, Stellar Network, RabbitMQ). |
| `data-flow-patient-management.mmd` | Patient registration data flow: `POST /patients` from the web client through the gateway, API validation/PII hashing, MongoDB insert, and the RabbitMQ event it emits. |
| `data-flow-payments-blockchain.mmd` | Payment processing data flow: `POST /payments` through invoice creation, Stellar transaction submission, network confirmation, and daily settlement/bank reconciliation. |
| `deployment-architecture.mmd` | Deployment topology across environments — local `docker-compose.dev.yml`, containerized `docker-compose.yml`, the Kubernetes `health-watchers` namespace, and the managed cloud services (MongoDB Atlas, Stellar Network, AWS Secrets Manager, S3) each promotes to. |
| `sequence-patient-registration.mmd` | Message-level sequence diagram for `POST /patients`, detailing the gateway forward, DB acknowledgement, and RabbitMQ event publication behind the patient registration data flow. |
| `sequence-payment-processing.mmd` | Message-level sequence diagram for `POST /payments`, detailing transaction build, multi-sig check, Horizon submission, and the reconciliation ledger stream behind the payment processing data flow. |
| `stellar-integration-components.mmd` | Internal module map of `apps/stellar-service` (HTTP layer, Horizon client, payment stream, state machine, reconciliation, batching, fee calculation, cold wallet, mainnet safety, network monitor) and how they connect to the main API and Stellar Horizon. |
| `auth-flow.mmd` | Authentication sequence: login, optional MFA/TOTP verification, access/refresh token issuance, authenticated request validation, and refresh-token rotation. |

## Rendering / exporting

Run `npm run docs:diagrams` (after `npm install`) to generate SVG exports of every diagram into
`docs/diagrams/export/`, using [`@mermaid-js/mermaid-cli`](https://github.com/mermaid-js/mermaid-cli).

> **Note:** These diagrams were authored and validated by hand against Mermaid syntax rules in an
> environment without network access, so `mermaid-cli` could not actually be installed or run here
> to confirm the render. Run `npm run docs:diagrams` locally (or let the `diagrams` CI workflow run
> it on a PR touching this directory) to verify the exports before relying on them.

## Editing

- Keep each `.mmd` file's content in sync with the corresponding fenced block in
  `docs/ARCHITECTURE.md` — the Markdown embeds are copies, not includes.
- Prefer small, focused diagrams (one concern per file) over a single monolithic diagram.
- The `diagrams` GitHub Actions workflow (`.github/workflows/diagrams.yml`) lints every `.mmd` file
  on PRs that touch `docs/diagrams/**` by running `mmdc` against each file.
