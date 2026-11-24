# Mutation Score Tracking, CI Integration & Enforcement

This document covers how mutation scores are measured over time, how CI enforces the >80 % target, and how to act when scores regress.

---

## Score definitions

```
mutation score = (killed + timeout) / (total − noCoverage − ignored) × 100
```

| Term | Meaning |
|------|---------|
| `killed` | Mutants caught by at least one failing test |
| `timeout` | Tests that timed out under the mutant (treated as killed) |
| `noCoverage` | Mutants in code that no test executes at all |
| `ignored` | Mutants suppressed with `// Stryker disable` comments |
| `survived` | Mutants that no test detected — the number to drive to zero |

NoCoverage mutants are excluded from the denominator because they indicate missing test coverage rather than weak assertions. They should be resolved by writing coverage tests, not by excluding the module.

---

## Thresholds

Configured in `apps/api/stryker.config.json`:

| Threshold | Value | Effect |
|-----------|-------|--------|
| `high` | 80 % | Stryker prints green; acceptance criterion met |
| `low` | 65 % | Stryker prints orange warning |
| `break` | 50 % | Stryker exits non-zero → CI pipeline fails immediately |

The `analyze-mutation-results.js` script enforces a separate `--threshold` flag that CI passes as `--threshold 80`. This means:

- Stryker itself only hard-fails below 50 %.
- The analysis step hard-fails below 80 %, giving a stricter gate without changing Stryker's own exit code semantics.

This two-layer approach lets you distinguish a "Stryker infrastructure error" (score=0, exit from Stryker) from a "score regression" (score=75, exit from analyzer).

---

## CI workflow — mutation-tests.yml

The workflow lives at `.github/workflows/mutation-tests.yml` and runs on every push or pull request that touches a mutated module.

### Trigger paths

The workflow only runs when files in these paths change, keeping CI fast:

```
apps/api/src/modules/auth/**
apps/api/src/services/token-denylist.service.ts
apps/api/stryker.config.json
```

Add a path entry here whenever you add a new module to `stryker.config.json`.

### Job steps

```
checkout → install → stryker run → upload reports → print summary
```

1. **`npm run test:mutation --workspace=api`** — runs Stryker with `stryker.config.json`. Fails (exit 1) if score drops below the `break` threshold (50 %).
2. **Upload artifacts** — `mutation.html` and `mutation.json` are uploaded as the `mutation-report` artifact, retained for 30 days. Download from the Actions run page.
3. **Print summary** — a short score/killed/survived/total summary is printed to the job log for quick inspection without downloading the artifact.

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_ACCESS_TOKEN_SECRET` | Used by token.service tests |
| `JWT_REFRESH_TOKEN_SECRET` | Used by token.service tests |
| `NODE_ENV` | Set to `test` |
| `API_PORT` | Set to `3001` |

These are passed inline in the workflow step. They are test-only dummy values — never real secrets.

### Downloading the HTML report

1. Go to the Actions tab → select the workflow run.
2. Scroll to **Artifacts** → download `mutation-report`.
3. Unzip and open `mutation.html` in a browser.
4. Click any file in the left panel to see per-mutant diffs.

---

## Enforcing the 80 % target

### Via analyze-mutation-results.js

```bash
# Enforce 80 % (CI usage)
node apps/api/scripts/analyze-mutation-results.js --threshold 80

# Local usage with default 60 % threshold
npm run test:mutation:analyze --workspace=api
```

Exit codes:

| Exit code | Meaning |
|-----------|---------|
| 0 | Score meets the threshold |
| 1 | Score is below the threshold |

The script also prints:
- Global score with target/gate labels
- Per-file breakdown sorted worst-first
- Surviving mutants with file, line, mutator type, and description
- Recommended test patterns for each surviving mutator type

### Adding the 80 % gate to CI

To enforce 80 % directly in the workflow, add this step after the Stryker run:

```yaml
- name: Enforce mutation score >= 80%
  run: node apps/api/scripts/analyze-mutation-results.js --threshold 80
```

This step runs regardless of whether Stryker itself passed, so it catches regressions in the 50–79 % range that Stryker's `break` threshold alone would not catch.

---

## Score tracking over time

### Manual tracking

After each run, record the score in a changelog comment in `stryker.config.json` or in a `MUTATION_SCORE_HISTORY.md` file. Include the date, branch, and global score. This gives a lightweight audit trail without additional tooling.

### Automated tracking (recommended)

To persist scores automatically, add a post-run step that appends to a JSON history file:

```yaml
- name: Record mutation score
  if: always()
  run: |
    node -e "
      const fs = require('fs');
      const report = require('./apps/api/reports/mutation/mutation.json');
      const files = report.files || {};
      let killed = 0, noCov = 0, total = 0;
      for (const f of Object.values(files))
        for (const m of (f.mutants || [])) {
          total++;
          if (m.status === 'Killed')     killed++;
          if (m.status === 'NoCoverage') noCov++;
        }
      const rel   = total - noCov;
      const score = rel > 0 ? Math.round(killed / rel * 100) : 100;
      const entry = {
        date:     new Date().toISOString().slice(0,10),
        branch:   process.env.GITHUB_REF_NAME || 'local',
        sha:      (process.env.GITHUB_SHA || 'local').slice(0,7),
        score,
        killed,
        survived: total - killed - noCov,
        total
      };
      const histPath = 'apps/api/reports/mutation/score-history.json';
      let hist = [];
      if (fs.existsSync(histPath)) hist = JSON.parse(fs.readFileSync(histPath,'utf8'));
      hist.push(entry);
      fs.writeFileSync(histPath, JSON.stringify(hist.slice(-100), null, 2));
      console.log('Score recorded:', score + '%');
    "
```

The history file can be committed to the repo or uploaded as a long-lived CI artifact, depending on your preferred visibility model.

### Reading the history

```js
// Quick local check
const history = require('./apps/api/reports/mutation/score-history.json');
const last5   = history.slice(-5);
last5.forEach(e => console.log(`${e.date}  ${e.branch}  ${e.score}%`));
```

---

## Score regression response

### Severity levels

| Score range | Severity | Required action |
|-------------|----------|----------------|
| ≥ 80 % | OK | No action needed |
| 65–79 % | Warning | Investigate surviving mutants; fix before next release |
| 50–64 % | Degraded | Block merge; fix surviving mutants in this PR |
| < 50 % | Critical | Stryker exits non-zero; CI blocked; fix immediately |

### Finding what regressed

```bash
# Run locally against main, note the score
git stash
npm run test:mutation --workspace=api
node apps/api/scripts/analyze-mutation-results.js > /tmp/score-main.txt
git stash pop

# Run against your branch
npm run test:mutation --workspace=api
node apps/api/scripts/analyze-mutation-results.js > /tmp/score-branch.txt

diff /tmp/score-main.txt /tmp/score-branch.txt
```

New surviving mutants in the diff point directly to the code changed in the PR that introduced the regression.

### Fixing a regression

1. Open the HTML report and filter to `Survived` status.
2. For each surviving mutant, identify which test should catch it.
3. Strengthen the test assertion (see [mutation-best-practices.md](./mutation-best-practices.md)).
4. Re-run `npm run test:mutation --workspace=api` until the mutant is killed.
5. Push the updated test — CI will re-run and verify.

---

## Per-module score targets

Some modules carry higher risk and should target higher scores:

| Module category | Minimum target | Rationale |
|-----------------|---------------|-----------|
| Auth / JWT | 90 % | Security-critical; any gap is a vulnerability |
| Encryption (`lib/encrypt.ts`) | 90 % | PHI data protection — HIPAA obligation |
| Token denylist | 85 % | Session revocation; survivors mean active sessions can't be killed |
| Payments validation | 85 % | Financial correctness |
| General utilities | 80 % | Global acceptance criterion |

These are soft targets enforced by code review. If a PR drops any auth or encryption module below its target, the reviewer should request additional tests before approving.

---

## Shields.io badge

To add a mutation score badge to a README, serve `reports/mutation/badge.json` from a static URL and reference it:

```json
{
  "schemaVersion": 1,
  "label": "mutation",
  "message": "82%",
  "color": "brightgreen"
}
```

```markdown
![mutation score](https://your-cdn.example.com/badge/mutation.json)
```

The badge file is generated automatically if you add the score-recording step shown above and update `message` and `color` based on the current score:

| Score | Color |
|-------|-------|
| ≥ 80 % | `brightgreen` |
| 65–79 % | `yellow` |
| < 65 % | `red` |
