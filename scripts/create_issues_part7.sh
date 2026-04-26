#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No secrets management — secrets only in \`.env\` files" \
  --label "enhancement" \
  --body "**Branch:** \`feat/secrets-management-policy\`
**Timeframe:** 2 days

## Description
All secrets are stored only in \`.env\` files with no rotation policy, no audit trail, and no access controls. For a HIPAA-regulated application, secrets must be managed with proper tooling.

## Tasks
- Document the secrets management strategy in \`SECURITY.md\`
- Integrate with a secrets manager (AWS Secrets Manager, HashiCorp Vault, or GitHub Secrets)
- Add a secrets rotation procedure
- Ensure no secrets are committed to git (add pre-commit hook)
- Document which secrets are required and their purpose in \`.env.example\`

## Acceptance Criteria
- No secrets are hardcoded in any source file
- A secrets rotation procedure is documented
- Pre-commit hooks prevent accidental secret commits"

gh issue create --repo "$REPO" \
  --title "\`.gitignore\` is minimal — build artifacts and sensitive files may be committed" \
  --label "chore" \
  --body "**Branch:** \`fix/expand-gitignore\`
**Timeframe:** 2 hours

## Description
The \`.gitignore\` file is only 42 bytes. It almost certainly does not cover all build artifacts, OS-specific files, editor files, and sensitive files. The \`.next/\` build directory, \`dist/\` folders, \`.turbo/\` cache, and \`.env\` files may all be tracked by git.

## Tasks
- Replace the minimal \`.gitignore\` with a comprehensive one covering: \`node_modules/\`, \`dist/\`, \`.next/\`, \`.turbo/\`, \`.env\` files, OS files, editor files, test artifacts, log files
- Run \`git rm --cached\` for any currently tracked files that should be ignored

## Acceptance Criteria
- \`git status\` shows no untracked \`.env\` files, \`dist/\` directories, or \`.next/\` directories
- \`node_modules/\` is not tracked in git
- OS and editor files are ignored"

gh issue create --repo "$REPO" \
  --title "No database seeding script for development" \
  --label "enhancement" \
  --body "**Branch:** \`feat/database-seed-script\`
**Timeframe:** 1 day

## Description
There is no seed script to populate the database with test data. Every developer who sets up the project must manually create a clinic, a user, and test patients via API calls before they can use the application.

## Tasks
- Create \`scripts/seed.ts\` that creates: 1 clinic, 1 SUPER_ADMIN user, 1 CLINIC_ADMIN user, 1 DOCTOR user, 10 sample patients, 5 sample encounters, 3 sample payment records
- Add \`\"seed\": \"ts-node scripts/seed.ts\"\` to the root \`package.json\` scripts
- The seed script must be idempotent — running it twice does not create duplicates (use \`upsert\`)

## Acceptance Criteria
- \`npm run seed\` runs without errors on a fresh database
- Running \`npm run seed\` twice does not create duplicate records
- After seeding, \`POST /auth/login\` with the seed credentials returns a valid token"

gh issue create --repo "$REPO" \
  --title "No database backup strategy documented" \
  --label "enhancement" \
  --body "**Branch:** \`feat/database-backup-strategy\`
**Timeframe:** 2 days

## Description
There is no documentation or automation for MongoDB backups. For a healthcare application storing patient records, data loss is a HIPAA violation and a patient safety issue.

## Tasks
- Document the backup strategy in \`DEPLOYMENT.md\`: daily automated backups, 30-day retention, encrypted at rest
- Create a \`scripts/backup.sh\` script that uses \`mongodump\` to create a compressed, timestamped backup
- Add a cron job configuration that runs the backup script daily
- Document the restore procedure using \`mongorestore\`

## Acceptance Criteria
- \`scripts/backup.sh\` creates a compressed backup file named \`backup-YYYY-MM-DD.tar.gz\`
- The backup script is documented in \`DEPLOYMENT.md\`
- The restore procedure is documented and tested"

gh issue create --repo "$REPO" \
  --title "\`turbo\` and \`typescript\` pinned to \`latest\` — non-deterministic builds" \
  --label "chore" \
  --body "**Branch:** \`fix/pin-dependency-versions\`
**Timeframe:** 3 hours

## Description
\`package.json\` uses \`\"turbo\": \"latest\"\` and multiple packages use \`\"typescript\": \"latest\"\`. These will resolve to different versions on different machines and at different times, making bugs extremely hard to reproduce.

## Tasks
- Pin \`turbo\` to a specific version in root \`package.json\`
- Pin \`typescript\` to a specific version in all \`package.json\` files across the monorepo
- Pin all other \`devDependencies\` that use \`latest\` or \`^\` ranges to exact versions
- Run \`npm install\` after pinning to update \`package-lock.json\`

## Acceptance Criteria
- No \`\"latest\"\` version specifiers remain in any \`package.json\` in the monorepo
- \`npm ci\` produces the exact same dependency tree on any machine"

gh issue create --repo "$REPO" \
  --title "No \`.nvmrc\` or Node.js version enforcement" \
  --label "chore" \
  --body "**Branch:** \`fix/nvmrc-node-version-enforcement\`
**Timeframe:** 2 hours

## Description
CI uses Node 18 but there is no \`.nvmrc\`, \`.node-version\`, or \`engines\` field to enforce this for local development. A developer using Node 16 or Node 20 may encounter subtle differences in behavior.

## Tasks
- Create \`.nvmrc\` at the monorepo root containing \`18\`
- Add \`\"engines\": { \"node\": \">=18.0.0\", \"npm\": \">=9.0.0\" }\` to root \`package.json\`
- Add \`\"engine-strict\": true\` to \`.npmrc\`
- Update CI to use the Node version specified in \`.nvmrc\`

## Acceptance Criteria
- Running \`nvm use\` in the project root switches to Node 18
- Running \`npm install\` on Node 16 prints an error and exits
- CI uses the Node version from \`.nvmrc\`"

gh issue create --repo "$REPO" \
  --title "No ESLint configuration — linting is effectively disabled" \
  --label "chore" \
  --body "**Branch:** \`feat/eslint-configuration\`
**Timeframe:** 1 day

## Description
\`npm run lint\` runs \`eslint src\` in the API package but there is no \`.eslintrc\`, \`eslint.config.js\`, or \`eslintConfig\` in any \`package.json\`. ESLint will use its defaults, which catch almost nothing. The lint step in CI is a false sense of security.

## Tasks
- Create \`packages/config/eslint-config/index.js\` as a shared ESLint config
- Include: \`@typescript-eslint/recommended\`, \`eslint-plugin-security\`, \`no-console\` (error in production), \`no-unused-vars\` (error)
- Add \`eslint.config.js\` to \`apps/api\`, \`apps/web\`, and \`apps/stellar-service\` extending the shared config
- Fix all existing lint errors before merging

## Acceptance Criteria
- \`npm run lint\` from the root runs ESLint across all packages and reports errors
- \`console.log\` in \`src/\` files causes a lint error
- CI fails if lint errors are present"

gh issue create --repo "$REPO" \
  --title "No Prettier configuration — inconsistent code formatting" \
  --label "chore" \
  --body "**Branch:** \`feat/prettier-precommit-hooks\`
**Timeframe:** 3 hours

## Description
No \`.prettierrc\` exists. Code style is inconsistent across files — mixed single and double quotes, inconsistent semicolons, varying indentation. This creates noisy diffs in PRs where formatting changes are mixed with logic changes.

## Tasks
- Create \`.prettierrc\` at the monorepo root: \`{ \"singleQuote\": true, \"semi\": true, \"tabWidth\": 2, \"trailingComma\": \"all\", \"printWidth\": 100 }\`
- Add \`prettier\` as a root \`devDependency\`
- Add \`format\` and \`format:check\` scripts to root \`package.json\`
- Install \`husky\` and \`lint-staged\`; configure a pre-commit hook that runs \`prettier --write\` on staged files

## Acceptance Criteria
- \`npm run format\` reformats all files consistently
- Committing an unformatted file triggers the pre-commit hook and auto-formats it
- CI fails if \`format:check\` finds unformatted files"

gh issue create --repo "$REPO" \
  --title "No \`pre-commit\` hooks — broken code can be committed" \
  --label "chore" \
  --body "**Branch:** \`feat/precommit-hooks-husky\`
**Timeframe:** 3 hours

## Description
There are no git hooks to prevent committing broken code. A developer can commit TypeScript errors, failing tests, unformatted code, or accidentally staged \`.env\` files.

## Tasks
- Install \`husky\` and \`lint-staged\` as root \`devDependencies\`
- Run \`npx husky init\` to set up the \`.husky/\` directory
- Configure \`lint-staged\` to run on staged files: ESLint + Prettier for \`*.{ts,tsx}\`
- Add a \`commit-msg\` hook that validates commit messages follow Conventional Commits format
- Add a secret-scanning hook using \`detect-secrets\` or \`gitleaks\`

## Acceptance Criteria
- Committing a file with an ESLint error is blocked by the pre-commit hook
- A commit message like \`fixed stuff\` is rejected; \`fix: resolve patient search ReDoS vulnerability\` is accepted
- Committing a file containing a string matching a secret pattern is blocked"

gh issue create --repo "$REPO" \
  --title "No \`CODEOWNERS\` file — no automatic PR review assignment" \
  --label "chore" \
  --body "**Branch:** \`feat/codeowners-pr-template\`
**Timeframe:** 3 hours

## Description
There is no \`CODEOWNERS\` file. Pull requests have no automatic reviewer assignment. Critical files (security middleware, payment processing, auth) can be merged without review from the appropriate team members.

## Tasks
- Create \`.github/CODEOWNERS\` assigning reviewers to critical paths
- Create \`.github/pull_request_template.md\` with a checklist
- Enable branch protection on \`main\`: require 1 approving review, require CI to pass

## Acceptance Criteria
- Opening a PR that modifies \`apps/api/src/modules/auth/\` automatically requests review from the security team
- The PR template is shown when opening a new PR
- Direct pushes to \`main\` are blocked"
