# Automated Code Quality Checks

Local, comment-free quality measurement and enforcement for the monorepo
(issue #1320), complementing the existing SonarCloud analysis
(`.github/workflows/sonarcloud.yml` + `sonar-project.properties`).

```
sources ─▶ complexity.json ─┐
          duplication.json ─┼─▶ score.json ─▶ gate ─▶ quality-dashboard.html
coverage ─▶ coverage-summary─┘        └─▶ suggestions.md ─▶ trend.json (history)
```

## What runs

| Tool | File | Measures |
|---|---|---|
| Complexity (TS AST) | `scripts/quality/analyze-complexity.js` | Cyclomatic complexity per function/file, Halstead volume, Maintainability Index |
| Duplication (token-based) | `scripts/quality/analyze-duplication.js` | Repeated token sequences ≥ 30 tokens across ≥ 2 files |
| Coverage | `npm run test:coverage --workspace={api,web,stellar-service}` | Line coverage per app |
| Maintainability score + gate | `scripts/quality/maintainability-score.js` | Weighted 0-100 quality score + per-dimension gates |
| Suggestions | `scripts/quality/suggestions.js` | Actionable, file/function-specific improvement list |
| Trend | `scripts/quality/record-trend.js` | Appends each run to `history/trend.json` |
| Dashboard + gate | `scripts/quality/generate-dashboard.js` | HTML dashboard, Markdown report, CI gate exit code |

Gate budgets live in `scripts/quality/gate.config.json`:

```jsonc
{
  "coverage":        { "minPercent": 60 },
  "duplication":     { "maxPercent": 10, "minTokens": 30 },
  "maintainability": { "minIndex": 65 },
  "complexity":      { "maxAvgPerFunction": 8, "maxHighRiskFunctions": 25 },
  "score":           { "minOverall": 70 }
}
```

## Local usage

```bash
# 1. coverage first (required by the score + suggestions tools)
npm run test:coverage --workspace=api
npm run test:coverage --workspace=web
npm run test:coverage --workspace=stellar-service

# 2. static analyses (any order)
node scripts/quality/analyze-complexity.js
node scripts/quality/analyze-duplication.js

# 3. score → suggestions → trend → dashboard
node scripts/quality/maintainability-score.js
node scripts/quality/suggestions.js
node scripts/quality/record-trend.js
node scripts/quality/generate-dashboard.js   # exit 1 when the gate fails
open scripts/quality/reports/quality-dashboard.html
```

Fast full gate without coverage: run steps 2-3 — coverage dimensions are
reported as failed until coverage is produced, so run it with coverage in CI.

## CI

`.github/workflows/code-quality.yml` runs the pipeline on **every PR** and
**every push to main/develop** plus **nightly**:

- runs API, web and Stellar unit tests **with coverage**
- computes complexity, duplication, maintainability score and suggestions
- **enforces the quality gate** — regressions fail the PR job, so the gate
  really prevents merge
- posts the report as a PR comment, uploads the dashboard artifact, records
  the trend for team-improvement tracking, and alerts Slack on failure
- trend history persists across runs via the actions cache

SonarCloud continues to provide external quality scores and new-code checks;
this pipeline adds the **local, fully-open-source** complexity, duplication,
maintainability and coverage gate with trend tracking.

## Maintenance

- **Tune budgets** in `gate.config.json`. Raise a budget only with evidence and
  after improving the code, never to hide a regression.
- **Add sources**: edit `SOURCES` at the top of the two analyzers.
- **Suggestion cadence**: generated every run; act on `[high]` items first.
- **Trend growth**: `HISTORY_MAX` (default 90) trims `history/trend.json`.