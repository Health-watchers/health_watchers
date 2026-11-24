---
title: Translation Plan
description: Plan for translating the user guide, starting with French.
---

# Translation Plan

The web app already ships in English, French, Hausa, Yoruba and Portuguese (`apps/web/messages`). The user guide will follow, starting with **French**.

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Site infrastructure: `fr` locale and language switcher (`docusaurus.config.ts`) | Done |
| 2 | French User Guide: overview, onboarding, inviting staff | Planned |
| 3 | French: CDS/ICD-10, wallet and payments, reports, patient data requests | Planned |
| 4 | Hausa, Yoruba, Portuguese | Planned |

## Rules for translators

- Use the exact button and menu labels from the French app (`apps/web/messages/fr.json`) so readers can match the screen.
- Keep role names, code examples and file paths unchanged.
- Translated pages go in `apps/docs/i18n/fr/docusaurus-plugin-content-docs/current/user-guide/`.
- Have each translated guide tested with the [guide testing checklist](./guide-testing.md) by a French-speaking user.
