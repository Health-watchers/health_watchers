# Batch-94: Web and Backend Refactoring Implementation Plan

Comprehensive strategy for issues #1517, #1518, #1519, and #1520.

---

## Overview

Four interconnected refactoring tasks to improve code organization, eliminate duplication, and modernize architecture:

1. **#1519** (Easy): Remove dead code and repository clutter
2. **#1518** (Easy): Remove duplicate web components and providers
3. **#1520** (Medium): Move AI route logic into controller/services
4. **#1517** (Medium): Break up oversized web pages into components

---

## Issue #1519: Remove Dead Code and Repository Clutter

### Dead Files to Remove

```
apps/api/src/modules/payments/loan-state-machine.ts
  - Never imported; "loan" is not a domain concept
  - Safe to delete

scripts/create_issues_part1..14.sh
  - One-time issue-creation scripts
  - No longer needed post-setup
  - Safe to delete

health_watchers/ (root directory)
  - Empty directory
  - Should be removed

verify-jwt-implementation.js (root)
  - One-time verification script
  - Should be removed

Duplicate configs:
  - apps/stellar-service/jest.config.js (keep) vs jest.config.ts (delete)
  - apps/web/tailwind.config.js (keep) vs tailwind.config.ts (delete) vs tailwind.config.responsive.js (check if used)
```

### Implementation Steps

1. Verify each file is unused using ts-prune/knip
2. Remove the identified dead files
3. Add knip to CI to catch unused files in future

### Commands

```bash
# Check for unused exports/files
npx knip --production

# Remove dead files
rm apps/api/src/modules/payments/loan-state-machine.ts
rm -rf scripts/create_issues_part*.sh
rm -rf health_watchers/
rm verify-jwt-implementation.js

# Keep duplicate configs analysis for manual review
# (may have responsive-specific overrides)
```

---

## Issue #1518: Remove Duplicate Web Components and Providers

### Duplicates to Consolidate

```
Toast Components:
  - ui/Toast.tsx (keep)
  - ui/toast.tsx (delete)

Error Boundary:
  - ErrorBoundary.tsx (check implementation)
  - ui/error-boundary.tsx (check implementation)
  - SectionErrorBoundary.tsx (keep - specialized)
  - ui/SectionErrorBoundary.tsx (delete duplicate)

Offline Indicator:
  - OfflineIndicator.tsx (check implementation)
  - offline-indicator.tsx (delete)

Query Providers:
  - lib/QueryClientProvider.tsx (keep)
  - lib/QueryProvider.tsx (delete/merge)

Realtime Providers:
  - RealtimeProvider (check)
  - LazyRealtimeProvider (check)
  - providers/LazySocketProvider (check - may be same as LazyRealtimeProvider)

Form Components (Create vs Edit):
  - forms/CreatePatientForm (keep - creation-specific)
  - PatientForm (check - may be generic form)
  - CreateEncounterForm (keep - creation-specific)
  - EncounterForm (check - may be generic form)
  - CreatePaymentIntentForm (keep - creation-specific)
  - PaymentIntentForm (check - may be generic form)

Middleware:
  - apps/web/middleware.ts (keep)
  - apps/web/src/middleware.ts (delete)
```

### Implementation Steps

1. For each duplicate:
   - Examine both implementations
   - Merge missing features into keeper
   - Update all imports to keeper
   - Delete duplicate

2. Add ESLint rule to block deleted paths

3. Add Next.js middleware check

### Example: Toast Consolidation

```typescript
// Keep ui/Toast.tsx with features from ui/toast.tsx
// Update imports from:
//   import { toast } from '@/ui/toast'
// To:
//   import { Toast } from '@/ui/Toast'

// Add ESLint rule (eslintrc.json):
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "@/ui/toast",
            "message": "Use @/ui/Toast instead"
          },
          {
            "name": "@/ui/error-boundary",
            "message": "Use @/components/ErrorBoundary instead"
          }
          // ... more rules
        ]
      }
    ]
  }
}
```

---

## Issue #1520: Move AI Route Logic into Controller/Services

### Current State

- `modules/ai/ai.routes.ts`: 902 lines with inline business logic
- Other modules: Use controller + service pattern

### Target State

```
modules/ai/
├── ai.routes.ts (50 lines) - Route definitions only
├── ai.controller.ts (150 lines) - HTTP handlers
├── ai.service.ts (700+ lines) - Business logic
│   ├── generateClinicalSummary()
│   ├── generateCarePlan()
│   ├── generateAssessment()
│   └── ... other operations
├── ai.validation.ts - Request/response schemas
├── ai.errors.ts - Custom errors
└── __tests__/
    ├── ai.controller.test.ts
    ├── ai.service.test.ts
    └── ai.integration.test.ts
```

### Refactoring Steps

1. Create ai.controller.ts:
   - Extract route handlers
   - Keep request/response transformation
   - Call service methods

2. Create ai.service.ts:
   - Move all business logic
   - Keep pure functions
   - Add comprehensive error handling

3. Create ai.validation.ts:
   - Move/create Zod schemas
   - Share schemas between controller and tests

4. Create ai.errors.ts:
   - Custom error types
   - Standardized error responses

5. Update tests:
   - Unit tests for service logic
   - Integration tests for controller
   - Mock service in controller tests

### Before/After Routes

```typescript
// BEFORE: ai.routes.ts (902 lines)
router.post('/summarize', async (req, res) => {
  const { encounters, patient_id } = req.body;
  
  // Validation
  if (!encounters || !Array.isArray(encounters)) {
    return res.status(400).json({ error: 'invalid encounters' });
  }
  
  // Business logic inline
  const clinicalContext = buildClinicalContext(encounters);
  const apiClient = initializeGeminiClient();
  
  const prompt = `Summarize these encounters: ${JSON.stringify(clinicalContext)}`;
  const response = await apiClient.generateContent(prompt);
  
  const summary = parseGeminiResponse(response);
  
  // Logging
  logger.info('summary generated', { patient_id, encounters_count: encounters.length });
  
  // Response
  return res.json({ summary });
});

// AFTER: ai.routes.ts (10 lines)
router.post('/summarize', asyncHandler(aiController.generateClinicalSummary));

// ai.controller.ts (30 lines)
export const aiController = {
  async generateClinicalSummary(req: Request, res: Response) {
    const validated = validateSummarizeRequest(req.body);
    const summary = await aiService.generateClinicalSummary(validated);
    res.json({ summary });
  }
};

// ai.service.ts (100+ lines)
export const aiService = {
  async generateClinicalSummary(data: SummarizeRequest) {
    const clinicalContext = buildClinicalContext(data.encounters);
    const prompt = createSummaryPrompt(clinicalContext);
    const response = await geminiClient.generateContent(prompt);
    return parseGeminiResponse(response);
  }
};
```

---

## Issue #1517: Break Up Oversized Web Pages into Components

### Large Pages Identified

| File | Lines | Suggested Components |
|------|-------|----------------------|
| encounters/new/page.tsx | 1,069 | EncounterForm, VitalsCapture, AssessmentBuilder |
| PatientDetailClient.tsx | 817 | PatientHeader, MedicalHistory, ActiveProblems, Medications |
| WalletClient.tsx | 700 | BalanceDisplay, TransactionHistory, PaymentForm |
| onboarding/page.tsx | 632 | ClinicForm, UserForm, SignupStepper |
| CarePlanTab.tsx | 597 | CarePlanList, CarePlanDetail, CarePlanForm |
| WebhookManager.tsx | 620 | WebhookList, WebhookForm, WebhookTester |

### Refactoring Strategy

1. **Analyze structure**: Identify logical sections and state boundaries
2. **Extract components**: Each major section becomes a component
3. **Manage state**: Determine component prop interfaces
4. **Maintain performance**: Use React.memo for expensive computations
5. **Preserve functionality**: Ensure behavior matches original

### Example: encounters/new/page.tsx Breakdown

```
encounters/new/
├── page.tsx (100 lines) - Page orchestrator
├── hooks/
│   ├── useEncounterForm.ts - Form state management
│   ├── useVitalsCapture.ts - Vitals collection logic
│   └── useAssessment.ts - Assessment logic
├── components/
│   ├── EncounterForm.tsx - Top-level form component
│   ├── VitalsSection.tsx - Vitals input & display
│   ├── AssessmentBuilder.tsx - Clinical assessment UI
│   ├── DiagnosisInput.tsx - Diagnosis autocomplete
│   ├── PrescriptionForm.tsx - Medication prescription
│   └── FollowUpPlanning.tsx - Follow-up scheduling
└── types/
    └── encounter.ts - Encounter-specific types
```

### Testing Considerations

- Component snapshot tests
- Integration tests for full flow
- Accessibility (a11y) tests
- Performance tests for large lists

---

## Implementation Priority & Effort

| Issue | Priority | Effort | Order |
|-------|----------|--------|-------|
| #1519 | P1 | Low | 1st (removes clutter) |
| #1518 | P2 | Medium | 2nd (fixes duplicates) |
| #1520 | P3 | High | 3rd (refactors backend) |
| #1517 | P4 | High | 4th (large refactor) |

---

## Risk Mitigation

1. **Breaking changes**: Each refactor should have test coverage first
2. **Import updates**: Use find-and-replace with regex to update imports
3. **ESLint rules**: Add restrictions immediately after deletions
4. **CI checks**: Run type checking and linting on all changes
5. **Feature branch**: Keep all changes isolated until ready

---

## Checklist

- [ ] Run knip to verify dead files
- [ ] Delete dead files (#1519)
- [ ] Create ESLint no-restricted-imports rule
- [ ] Consolidate duplicate components (#1518)
- [ ] Verify Next.js middleware is single file
- [ ] Extract AI controller and services (#1520)
- [ ] Break up large page components (#1517)
- [ ] Update all imports
- [ ] Run type checking (tsc --noEmit)
- [ ] Run linting (eslint .)
- [ ] Run tests
- [ ] Verify in browser

