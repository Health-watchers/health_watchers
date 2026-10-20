# Customizable Validation Rules System

Implements the rule engine described in Issue 1.

## What's included

- `types.ts` — rule definition format (`RuleDefinition`, `RuleCondition`), versioning
  (`RuleVersionEntry`), evaluation results, conflict, and test-case types.
- `engine.ts`:
  - `evaluateRule` / `evaluateRuleSet` — evaluation engine, records per-rule and
    total duration (`durationMs`) to support the <50ms performance target.
  - `registerCustomValidator` / `unregisterCustomValidator` — plug in custom
    validation functions by name, referenced via `RuleCondition.customFunctionName`.
  - `bumpRuleVersion` — versioning: produces a new immutable `RuleDefinition`
    plus a `RuleVersionEntry` for history/audit trails.
  - `detectRuleConflicts` — heuristic pass flagging rules that contradict each
    other on the same field (opposite equality checks, required-vs-forbidden).
  - `runRuleTests` — minimal testing framework: runs named fixtures against a
    rule and reports pass/fail per case.
  - `formatErrorMessage` — interpolates `{{field}}` tokens into human-readable
    error messages for helpful validation feedback.
  - `createEmptyRule` — scaffolds a new rule with sane defaults.

## Not implemented (out of scope for this pass)

- Persistence/storage layer for rules (currently in-memory / caller-supplied).
- UI for authoring rules and viewing conflicts.
- Formal documentation site generation (`Create rule documentation` task) —
  this README plus inline JSDoc on exported functions serves as the initial
  documentation surface.

## Debugging

Each `RuleEvaluationResult` includes `durationMs` and the interpolated
`message`, which is sufficient to trace why a given rule passed or failed
without additional tooling.
