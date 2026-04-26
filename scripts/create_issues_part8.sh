#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No \`dependabot\` configuration — dependencies never automatically updated" \
  --label "chore" \
  --body "**Branch:** \`feat/dependabot-configuration\`
**Timeframe:** 2 hours

## Description
There is no Dependabot configuration. Security vulnerabilities in dependencies will not be automatically flagged or patched. For a healthcare application, unpatched dependencies are a compliance risk.

## Tasks
- Create \`.github/dependabot.yml\` configuring weekly dependency updates for npm packages and GitHub Actions
- Set \`open-pull-requests-limit: 10\`
- Configure \`ignore\` rules for major version bumps
- Enable GitHub's automated security alerts and secret scanning

## Acceptance Criteria
- Dependabot opens PRs weekly for outdated npm packages
- Security vulnerability PRs are opened immediately
- GitHub secret scanning is enabled"

gh issue create --repo "$REPO" \
  --title "Turbo \`test\` task missing from \`turbo.json\`" \
  --label "chore" \
  --body "**Branch:** \`fix/turbo-test-task\`
**Timeframe:** 2 hours

## Description
\`turbo.json\` defines \`build\`, \`dev\`, \`lint\`, and \`start\` tasks but no \`test\` task. When tests are added, running \`turbo run test\` will fail because Turbo has no configuration for it.

## Tasks
- Add a \`test\` task to \`turbo.json\` with \`dependsOn: [\"^build\"]\`, \`outputs: [\"coverage/**\"]\`, \`cache: true\`
- Add \`\"test\": \"jest --coverage\"\` scripts to \`apps/api/package.json\`
- Verify \`turbo run test\` executes tests across all packages
- Add \`coverage/\` to \`.gitignore\`

## Acceptance Criteria
- \`turbo run test\` runs tests in all packages that have a \`test\` script
- Test results are cached by Turbo
- CI uses \`turbo run test\` rather than per-package test commands"

gh issue create --repo "$REPO" \
  --title "No \`package.json\` \`description\` or \`repository\` fields" \
  --label "chore" \
  --body "**Branch:** \`fix/package-json-metadata-license\`
**Timeframe:** 2 hours

## Description
Root and workspace \`package.json\` files are missing \`description\`, \`repository\`, \`license\`, \`author\`, and \`keywords\` fields. These are important for npm publishing, GitHub repository metadata, and legal clarity.

## Tasks
- Add to root \`package.json\`: \`description\`, \`license\`, \`author\`, \`repository\`
- Add \`description\` and \`license\` to each workspace \`package.json\`
- Create a \`LICENSE\` file at the repository root

## Acceptance Criteria
- Root \`package.json\` has \`description\`, \`license\`, \`author\`, and \`repository\` fields
- A \`LICENSE\` file exists at the repository root
- All workspace packages have a \`license\` field matching the root"

gh issue create --repo "$REPO" \
  --title "No \`tsconfig\` path aliases — long relative imports throughout" \
  --label "chore" \
  --body "**Branch:** \`feat/tsconfig-path-aliases\`
**Timeframe:** 3 hours

## Description
TypeScript files use long relative imports like \`../../middlewares/auth.middleware\`. As the codebase grows, these become hard to read and break when files are moved.

## Tasks
- Add path aliases to \`tsconfig.base.json\`: \`\"@api/*\": [\"apps/api/src/*\"]\`, \`\"@web/*\": [\"apps/web/src/*\"]\`
- Update each app's \`tsconfig.json\` to extend \`tsconfig.base.json\`
- For \`apps/web\`, also configure the aliases in \`next.config.js\`
- Replace all relative imports deeper than 2 levels with alias imports

## Acceptance Criteria
- \`import { authenticate } from '@api/middlewares/auth.middleware'\` resolves correctly
- No relative import goes more than 2 directory levels deep
- \`npm run build\` passes for all packages"

gh issue create --repo "$REPO" \
  --title "No monitoring or alerting setup" \
  --label "enhancement" \
  --body "**Branch:** \`feat/monitoring-sentry-integration\`
**Timeframe:** 2 days

## Description
There is no error tracking, performance monitoring, or uptime alerting. In production, if the API starts returning 500 errors or the Stellar service goes down, there is no automated notification. For a healthcare application, downtime directly impacts patient care.

## Tasks
- Integrate Sentry for error tracking: \`@sentry/node\` for the API, \`@sentry/nextjs\` for the web
- Add \`SENTRY_DSN\` to \`.env.example\`
- Configure Sentry to capture unhandled exceptions and promise rejections
- Set up an uptime monitor for the \`/health\` endpoint
- Add alerting rules: alert if error rate exceeds 1% or p95 response time exceeds 2 seconds

## Acceptance Criteria
- Unhandled exceptions in the API are captured in Sentry with full stack traces
- The \`/health\` endpoint is monitored and alerts fire within 5 minutes of downtime
- PHI is never sent to Sentry (scrub patient names, IDs from error context)"

gh issue create --repo "$REPO" \
  --title "No performance testing or load testing" \
  --label "enhancement" \
  --body "**Branch:** \`feat/load-performance-testing\`
**Timeframe:** 3 days

## Description
There is no load testing to understand how the API performs under realistic clinical load. A clinic with 50 concurrent users could overwhelm the API if it has N+1 query problems, missing indexes, or insufficient connection pooling.

## Tasks
- Install \`k6\` (or \`artillery\`) and create \`tests/load/patients.js\` simulating 50 concurrent users
- Define performance budgets: p95 response time < 500ms, error rate < 0.1%, throughput > 100 req/s
- Add a \`test:load\` script to \`package.json\`
- Fix any performance issues discovered

## Acceptance Criteria
- \`npm run test:load\` runs the k6 load test and outputs a summary
- The API meets the defined performance budgets under 50 concurrent users
- Any endpoint with p95 > 500ms has a documented optimization plan"

gh issue create --repo "$REPO" \
  --title "No \`CONTRIBUTING.md\` — no onboarding guide for new developers" \
  --label "documentation" \
  --body "**Branch:** \`docs/contributing-guide\`
**Timeframe:** 1 day

## Description
\`README.md\` references \`CONTRIBUTING.md\` as 'TBD'. New contributors have no guide for setting up the development environment, branching strategy, commit message conventions, or PR process.

## Tasks
- Create \`CONTRIBUTING.md\` covering: prerequisites, local setup steps, branching strategy, commit message format (Conventional Commits), PR process, code review checklist

## Acceptance Criteria
- A new developer can set up the project from scratch following only \`CONTRIBUTING.md\`
- The branching strategy is clearly defined
- Commit message format is documented with examples
- \`README.md\` links to \`CONTRIBUTING.md\`"

gh issue create --repo "$REPO" \
  --title "No \`SECURITY.md\` — no security policy or vulnerability reporting process" \
  --label "documentation" \
  --body "**Branch:** \`docs/security-policy\`
**Timeframe:** 1 day

## Description
There is no \`SECURITY.md\` file. GitHub uses this file to display security policy information and to provide a private channel for reporting vulnerabilities. For a healthcare application, having a clear security policy is essential for compliance and trust.

## Tasks
- Create \`SECURITY.md\` covering: supported versions, how to report a vulnerability, response timeline, security controls implemented, HIPAA compliance status, data retention and deletion policy

## Acceptance Criteria
- \`SECURITY.md\` exists at the repository root
- GitHub's 'Security' tab shows the security policy
- The vulnerability reporting channel is a private email or GitHub's private reporting feature
- HIPAA controls are documented"

gh issue create --repo "$REPO" \
  --title "No \`DEPLOYMENT.md\` — no production deployment guide" \
  --label "documentation" \
  --body "**Branch:** \`docs/deployment-guide\`
**Timeframe:** 2 days

## Description
There is no documentation on how to deploy the application to production. \`npm run build\` exists but there is no guidance on environment setup, database provisioning, SSL termination, reverse proxy configuration, or monitoring setup.

## Tasks
- Create \`DEPLOYMENT.md\` covering: prerequisites, environment variables, build steps, Docker deployment, database setup, reverse proxy (Nginx config example), health checks, monitoring, rollback procedure

## Acceptance Criteria
- A DevOps engineer with no prior knowledge of the project can deploy it to production following \`DEPLOYMENT.md\`
- All required env vars are listed with descriptions
- The Nginx config example is valid and tested
- The rollback procedure is clear and actionable"

gh issue create --repo "$REPO" \
  --title "No \`CHANGELOG.md\` or versioning strategy" \
  --label "documentation" \
  --body "**Branch:** \`docs/changelog-versioning-strategy\`
**Timeframe:** 1 day

## Description
There is no changelog and no semantic versioning strategy. When a bug is fixed or a feature is added, there is no record of what changed between versions. For a healthcare application, change tracking is important for compliance audits.

## Tasks
- Create \`CHANGELOG.md\` following the Keep a Changelog format
- Add an initial entry for \`v0.1.0\` documenting the current scaffold state
- Adopt Conventional Commits as the commit message standard
- Install \`@changesets/cli\` for automated changelog generation
- Add a GitHub Actions workflow that creates a release on merge to \`main\`

## Acceptance Criteria
- \`CHANGELOG.md\` exists and follows the Keep a Changelog format
- A new entry is added for every PR that changes user-facing behaviour
- GitHub Releases are created automatically on merge to \`main\`"
